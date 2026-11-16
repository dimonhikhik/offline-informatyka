"""Tkinter API for classroom programs in the browser's Python worker."""

import asyncio
import itertools
import json
import re
import sys
import traceback
import types

import _school_tk as _bridge

_publish = _bridge.publish
_next_event = getattr(_bridge, "nextEvent", None)
_wake = getattr(_bridge, "wake", None)

try:
    from pyodide.ffi import can_run_sync as _can_run_sync, run_sync as _run_sync
except (ImportError, AttributeError):
    def _can_run_sync():
        return False

__path__ = []
END, INSERT, CURRENT, SEL = "end", "insert", "current", "sel"
TOP, BOTTOM, LEFT, RIGHT = "top", "bottom", "left", "right"
X, Y, BOTH, NONE = "x", "y", "both", "none"
N, S, E, W, CENTER = "n", "s", "e", "w", "center"
NE, NW, SE, SW, NSEW = "ne", "nw", "se", "sw", "nsew"
NORMAL, DISABLED, ACTIVE, READONLY = "normal", "disabled", "active", "readonly"
HORIZONTAL, VERTICAL = "horizontal", "vertical"
RAISED, SUNKEN, RIDGE, GROOVE, FLAT, SOLID = "raised", "sunken", "ridge", "groove", "flat", "solid"
WORD, CHAR, ALL = "word", "char", "all"


class TclError(Exception):
    pass


_widgets, _windows, _timers, _global_bindings = {}, {}, {}, {}
_ids = itertools.count(1)
_default_root = _dialog = _dialog_result = _pending_render = None
_aliases = {"bg": "background", "fg": "foreground", "bd": "borderwidth"}
_visible_options = {
    "text", "width", "height", "background", "foreground", "font", "anchor",
    "justify", "wraplength", "borderwidth", "relief", "padx", "pady", "state",
    "show", "values", "from", "to", "orient", "maximum", "mode", "resolution",
    "length", "cursor", "selectmode", "underline"
}


def _call(callback, *args):
    if callback is None:
        return
    try:
        return callback(*args)
    except Exception:
        traceback.print_exc()


def _flush():
    global _pending_render
    if _pending_render is not None:
        _pending_render.cancel()
        _pending_render = None
    model = {"windows": [widget._model() for widget in _windows.values() if not widget._withdrawn],
             "dialog": _dialog}
    _publish(json.dumps(model, ensure_ascii=False, allow_nan=False))


def _changed():
    global _pending_render
    if _pending_render is not None:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _flush()
    else:
        _pending_render = loop.call_soon(_flush)


def _reset():
    global _default_root, _dialog, _dialog_result
    for timer in _timers.values():
        timer.cancel()
    _timers.clear()
    _widgets.clear()
    _windows.clear()
    _global_bindings.clear()
    _default_root = _dialog = _dialog_result = None
    _flush()


def _options(cnf, kw):
    return {_aliases.get(key, key.rstrip("_")): value for key, value in (dict(cnf or {}) | kw).items()}


def _serializable(value):
    if isinstance(value, Font):
        return value.options
    if isinstance(value, (list, tuple)):
        return [_serializable(item) for item in value[:250]]
    if isinstance(value, str):
        return value[:10000]
    if isinstance(value, float) and not (-1e12 < value < 1e12):
        return 0
    return value if isinstance(value, (bool, int, float)) or value is None else str(value)[:1000]


class Variable:
    _initial = ""
    _cast = str

    def __init__(self, master=None, value=None, name=None):
        self._value = self._initial if value is None else value
        self._traces = {}
        self._name = name or f"PY_VAR{next(_ids)}"

    def get(self):
        return self._cast(self._value)

    def set(self, value):
        self._value = value
        for mode, callback in list(self._traces.values()):
            if mode == "write":
                _call(callback, self._name, "", "write")
        _changed()

    def trace_add(self, mode, callback):
        identifier = str(next(_ids))
        self._traces[identifier] = (mode, callback)
        return identifier

    def trace_remove(self, mode, identifier):
        if identifier in self._traces:
            del self._traces[identifier]

    def __str__(self):
        return self._name


class StringVar(Variable):
    pass


class IntVar(Variable):
    _initial = 0
    _cast = staticmethod(int)


class DoubleVar(Variable):
    _initial = 0.0
    _cast = staticmethod(float)


class BooleanVar(Variable):
    _initial = False
    _cast = staticmethod(lambda value: str(value).lower() not in ("", "0", "false", "no", "off", "none"))


class Font:
    def __init__(self, root=None, font=None, **kw):
        self.options = dict(kw)
        if isinstance(font, (list, tuple)):
            self.options.update(zip(("family", "size", "weight"), font))

    def configure(self, **kw):
        self.options.update(kw)
        _changed()

    config = configure

    def cget(self, option):
        return self.options.get(option, "")


class Event:
    def __init__(self, widget, source):
        self.widget = widget
        self.x = source.get("x", 0)
        self.y = source.get("y", 0)
        self.x_root, self.y_root = self.x, self.y
        key = source.get("key", "")
        aliases = {"Enter": "Return", " ": "space", "ArrowLeft": "Left", "ArrowRight": "Right",
                   "ArrowDown": "Down", "ArrowUp": "Up"}
        self.keysym = aliases.get(key, key)
        self.char = key if len(key) == 1 else "\r" if key == "Enter" else ""
        self.num = source.get("button", 1)


class Widget:
    _kind = "frame"

    def __init__(self, master=None, cnf=None, **kw):
        global _default_root
        if len(_widgets) >= 180:
            raise TclError("Забагато віджетів у програмі (до 180).")
        if master is None and self._kind != "window":
            master = _default_root if _default_root is not None else Tk()
        self.master = master
        self._id = next(_ids)
        self._options = _options(cnf, kw)
        self._children = []
        self._bindings = {}
        self._layout = {}
        self._tracks = {"row": {}, "column": {}}
        self._focus = 0
        self._revision = 0
        self._cursor = None
        _widgets[self._id] = self
        if master is not None:
            master._children.append(self)

    @property
    def children(self):
        return {str(child._id): child for child in self._children}

    def configure(self, cnf=None, **kw):
        if cnf is None and not kw:
            return dict(self._options)
        self._options.update(_options(cnf, kw))
        _changed()

    config = configure

    def cget(self, key):
        return self._options.get(_aliases.get(key, key), "")

    __getitem__ = cget

    def __setitem__(self, key, value):
        self.configure({key: value})

    def _set_layout(self, kind, kw):
        if self._layout.get("kind") != kind:
            self._layout = {"kind": kind}
        self._layout.update(kw)
        _changed()

    def pack(self, **kw):
        self._set_layout("pack", kw)

    pack_configure = pack

    def grid(self, **kw):
        self._set_layout("grid", kw)

    grid_configure = grid

    def place(self, **kw):
        self._set_layout("place", kw)

    place_configure = place

    def pack_forget(self):
        self._layout = {}
        _changed()

    grid_forget = grid_remove = place_forget = pack_forget

    def _set_track(self, axis, index, kw):
        indexes = index if isinstance(index, (list, tuple)) else [index]
        for value in indexes:
            self._tracks[axis][int(value)] = {key: kw[key] for key in ("weight", "minsize") if key in kw}
        _changed()

    def grid_rowconfigure(self, index, **kw):
        self._set_track("row", index, kw)

    def grid_columnconfigure(self, index, **kw):
        self._set_track("column", index, kw)

    rowconfigure, columnconfigure = grid_rowconfigure, grid_columnconfigure

    def bind(self, sequence, func=None, add=None):
        if func is not None:
            handlers = self._bindings.setdefault(sequence, [])
            if add != "+":
                handlers.clear()
            handlers.append(func)
        return sequence

    def unbind(self, sequence, funcid=None):
        self._bindings.pop(sequence, None)

    def bind_all(self, sequence, func, add=None):
        handlers = _global_bindings.setdefault(sequence, [])
        if add != "+":
            handlers.clear()
        handlers.append(func)

    def bindtags(self):
        return (str(self._id), type(self).__name__, "all")

    def focus_set(self):
        self._focus = next(_ids)
        _changed()

    focus = focus_set

    def winfo_children(self):
        return list(self._children)

    def winfo_exists(self):
        return int(self._id in _widgets)

    def winfo_width(self):
        return int(self._options.get("width", 1))

    def winfo_height(self):
        return int(self._options.get("height", 1))

    def destroy(self):
        for child in list(self._children):
            child.destroy()
        if self.master is not None and self in self.master._children:
            self.master._children.remove(self)
        _widgets.pop(self._id, None)
        _changed()

    def update_idletasks(self):
        _flush()

    update = update_idletasks

    def bell(self):
        pass

    def after(self, milliseconds, func=None, *args):
        seconds = max(0, float(milliseconds)) / 1000
        if func is None:
            if _can_run_sync():
                _run_sync(asyncio.sleep(seconds))
                return None
            raise TclError("Для after(час) скористайся формою after(час, функція).")
        identifier = str(next(_ids))

        def dispatch():
            _timers.pop(identifier, None)
            if self.winfo_exists():
                _call(func, *args)
                _flush()

        _timers[identifier] = asyncio.get_event_loop().call_later(seconds, dispatch)
        return identifier

    def after_idle(self, func, *args):
        return self.after(0, func, *args)

    def after_cancel(self, identifier):
        timer = _timers.pop(identifier, None)
        if timer:
            timer.cancel()

    def _model(self):
        model = {"id": self._id, "kind": self._kind,
                 "options": {key: _serializable(value) for key, value in self._options.items() if key in _visible_options},
                 "layout": {key: _serializable(value) for key, value in self._layout.items()},
                 "tracks": self._tracks,
                 "children": [child._model() for child in self._children if child._layout],
                 "focus": self._focus, "revision": self._revision,
                 "bind": bool(self._bindings)}
        text = self._options.get("textvariable")
        if isinstance(text, Variable):
            model["options"]["text"] = str(text._value)[:10000]
        return model

    def _input(self, value, event):
        pass

    def _invoke(self):
        _call(self._options.get("command"))


class Tk(Widget):
    _kind = "window"

    def __init__(self, screenName=None, baseName=None, className="Tk", useTk=True,
                 sync=False, use=None, **kw):
        self._initialize(None, kw)

    def _initialize(self, master, kw):
        global _default_root
        if len(_windows) >= 8:
            raise TclError("Можна відкрити до восьми вікон.")
        Widget.__init__(self, master, **kw)
        self._title = "Tkinter"
        self._geometry = ""
        self._protocols = {}
        self._withdrawn = False
        self._quit = False
        self.tk = self
        _windows[self._id] = self
        if _default_root is None:
            _default_root = self
        _changed()

    def title(self, text=None):
        if text is None:
            return self._title
        self._title = str(text)
        _changed()

    wm_title = title

    def geometry(self, spec=None):
        if spec is None:
            return self._geometry
        self._geometry = str(spec)
        _changed()

    wm_geometry = geometry

    def minsize(self, width=None, height=None):
        if width is not None:
            self.configure(width=width, height=height)

    def maxsize(self, width=None, height=None):
        if width is not None:
            self.configure(width=width, height=height)

    def resizable(self, width=None, height=None):
        return (True, True)

    def protocol(self, name, callback=None):
        if callback is not None:
            self._protocols[name] = callback
        return self._protocols.get(name)

    wm_protocol = protocol

    def withdraw(self):
        self._withdrawn = True
        _changed()

    def deiconify(self):
        self._withdrawn = False
        _changed()

    def mainloop(self, n=0):
        self._quit = False
        _flush()
        if _next_event is not None and _can_run_sync():
            while _windows and not self._quit:
                _dispatch(str(_run_sync(_next_event())))

    def quit(self):
        self._quit = True
        if _wake is not None:
            _wake()

    def destroy(self):
        global _default_root, _dialog
        _windows.pop(self._id, None)
        if not _windows:
            _dialog = None
            if _wake is not None:
                _wake()
        super().destroy()
        if self is _default_root:
            _default_root = next(iter(_windows.values()), None)

    def _model(self):
        model = super()._model()
        match = re.match(r"=?(\d+)x(\d+)", self._geometry)
        if match:
            model["width"], model["height"] = map(int, match.groups())
        model["title"] = self._title[:500]
        return model


class Toplevel(Tk):
    def __init__(self, master=None, cnf=None, **kw):
        self._initialize(master if master is not None else _default_root, _options(cnf, kw))


class Frame(Widget):
    pass


class LabelFrame(Frame):
    _kind = "label-frame"


Labelframe = LabelFrame


class Label(Widget):
    _kind = "label"


class Button(Widget):
    _kind = "button"

    def invoke(self):
        if self.cget("state") != DISABLED:
            return _call(self._options.get("command"))

    _invoke = invoke


class Entry(Widget):
    _kind = "entry"

    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, cnf, **kw)
        self._value = ""

    def get(self):
        variable = self._options.get("textvariable")
        return str(variable._value) if isinstance(variable, Variable) else self._value

    def _set(self, value):
        value = str(value)[:10000]
        variable = self._options.get("textvariable")
        if isinstance(variable, Variable):
            variable.set(value)
        else:
            self._value = value
        _changed()

    def index(self, position):
        text = self.get()
        if position == "end":
            return len(text)
        if position == "insert":
            return self._cursor if self._cursor is not None else len(text)
        if position == "anchor":
            return 0
        return min(len(text), max(0, int(position)))

    def insert(self, index, value):
        at = self.index(index)
        text = self.get()
        self._set(text[:at] + str(value) + text[at:])

    def delete(self, first, last=None):
        start = self.index(first)
        stop = start + 1 if last is None else self.index(last)
        text = self.get()
        self._set(text[:start] + text[stop:])

    def set(self, value):
        self._set(value)

    def _input(self, value, event):
        self._cursor = event.get("cursor")
        self._set(value)

    def _model(self):
        return super()._model() | {"value": self.get()[:10000]}


class Text(Entry):
    _kind = "text"

    def index(self, position):
        if position in ("end-1c", "end -1c"):
            return len(self._value)
        if isinstance(position, str) and "." in position:
            line, column = position.split(".", 1)
            lines = self._value.split("\n")
            row = min(len(lines) - 1, max(0, int(line) - 1))
            return sum(len(text) + 1 for text in lines[:row]) + (len(lines[row]) if column == "end" else min(len(lines[row]), int(column)))
        return super().index(position)

    def get(self, first=None, last=None):
        if first is None:
            return self._value
        start = self.index(first)
        text = self._value if last != "end" else self._value + "\n"
        return text[start:start + 1 if last is None else len(text) if last == "end" else self.index(last)]


class Checkbutton(Button):
    _kind = "check"

    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, cnf, **kw)
        self._options.setdefault("variable", IntVar())

    def select(self):
        self._options["variable"].set(self._options.get("onvalue", 1))

    def deselect(self):
        self._options["variable"].set(self._options.get("offvalue", 0))

    def toggle(self):
        self.deselect() if self._model()["checked"] else self.select()

    def invoke(self):
        if self.cget("state") != DISABLED:
            self.toggle()
            return super().invoke()

    _invoke = invoke

    def _model(self):
        return super()._model() | {"checked": self._options["variable"]._value == self._options.get("onvalue", 1)}


class Radiobutton(Checkbutton):
    _kind = "radio"

    def select(self):
        self._options["variable"].set(self._options.get("value", 1))

    def toggle(self):
        self.select()

    def _model(self):
        return Widget._model(self) | {"checked": self._options["variable"]._value == self._options.get("value", 1)}


class Combobox(Entry):
    _kind = "combo"

    def current(self, index=None):
        values = list(self._options.get("values", ()))
        if index is None:
            return values.index(self.get()) if self.get() in values else -1
        self._set(values[int(index)])


class Listbox(Widget):
    _kind = "list"

    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, cnf, **kw)
        self._items = []
        self._selected = ()

    def _index(self, index, insert=False):
        if index == END:
            return len(self._items) if insert else len(self._items) - 1
        return max(0, int(index))

    def insert(self, index, *elements):
        at = self._index(index, True)
        self._items[at:at] = [str(element) for element in elements[:250 - len(self._items)]]
        _changed()

    def delete(self, first, last=None):
        start = self._index(first)
        del self._items[start:start + 1 if last is None else self._index(last) + 1]
        self._selected = ()
        _changed()

    def get(self, first, last=None):
        start = self._index(first)
        return self._items[start] if last is None else tuple(self._items[start:self._index(last) + 1])

    def curselection(self):
        return self._selected

    def selection_set(self, first, last=None):
        start = self._index(first)
        self._selected = tuple(range(start, start + 1 if last is None else self._index(last) + 1))
        _changed()

    select_set = selection_set

    def selection_clear(self, first, last=None):
        self._selected = ()
        _changed()

    select_clear = selection_clear

    def size(self):
        return len(self._items)

    def _input(self, value, event):
        indexes = value if isinstance(value, list) else [value]
        self._selected = tuple(int(i) for i in indexes if str(i).isdigit() and int(i) < len(self._items))
        _changed()

    def _model(self):
        return super()._model() | {"items": [item[:1000] for item in self._items], "selected": self._selected}


class Scale(Entry):
    _kind = "scale"

    def get(self):
        variable = self._options.get("variable")
        value = variable._value if isinstance(variable, Variable) else self._value
        return float(value or self._options.get("from", 0))

    def _set(self, value):
        value = float(value)
        variable = self._options.get("variable")
        if isinstance(variable, Variable):
            variable.set(value)
        else:
            self._value = value
        _changed()

    def _input(self, value, event):
        self._set(value)
        _call(self._options.get("command"), str(value))

    def _model(self):
        return Widget._model(self) | {"value": self.get()}


class Spinbox(Entry):
    _kind = "spin"


class Progressbar(Widget):
    _kind = "progress"

    def step(self, amount=1):
        limit = float(self._options.get("maximum", 100))
        self.configure(value=(float(self._options.get("value", 0)) + float(amount)) % (limit + 1))

    def start(self, interval=50):
        self.stop()

        def advance():
            self.step()
            self._timer = self.after(interval, advance)

        advance()

    def stop(self):
        if hasattr(self, "_timer"):
            self.after_cancel(self._timer)
            del self._timer

    def _model(self):
        variable = self._options.get("variable")
        value = variable._value if isinstance(variable, Variable) else self._options.get("value", 0)
        return super()._model() | {"value": _serializable(value)}


class Separator(Widget):
    _kind = "separator"


class Canvas(Widget):
    _kind = "canvas"

    def __init__(self, master=None, cnf=None, **kw):
        super().__init__(master, cnf, **kw)
        self._items = {}

    def _create(self, shape, coords, options):
        if len(self._items) >= 550:
            raise TclError("Забагато об’єктів Canvas (до 550).")
        if len(coords) == 1 and isinstance(coords[0], (list, tuple)):
            coords = coords[0]
        coords = [float(coord) for coord in coords]
        enough = len(coords) >= (2 if shape == "text" else 4)
        if not enough or len(coords) % 2 or len(coords) > 400:
            raise TclError("Перевір кількість координат Canvas.")
        handle = next(_ids)
        self._items[handle] = (shape, coords, dict(options))
        _changed()
        return handle

    def _matching(self, search):
        for handle, (_, _, options) in self._items.items():
            tags = options.get("tags", ())
            if isinstance(tags, str):
                tags = tags.split()
            if search == "all" or str(handle) == str(search) or search in tags:
                yield handle

    def create_rectangle(self, *coords, **options):
        return self._create("rectangle", coords, options)

    def create_oval(self, *coords, **options):
        return self._create("oval", coords, options)

    def create_line(self, *coords, **options):
        return self._create("line", coords, options)

    def create_polygon(self, *coords, **options):
        return self._create("polygon", coords, options)

    def create_text(self, *coords, **options):
        return self._create("text", coords, options)

    def delete(self, *searches):
        for search in searches:
            for handle in list(self._matching(search)):
                del self._items[handle]
        _changed()

    def itemconfigure(self, search, cnf=None, **options):
        for handle in self._matching(search):
            self._items[handle][2].update(_options(cnf, options))
        _changed()

    itemconfig = itemconfigure

    def coords(self, search, *coords):
        handles = list(self._matching(search))
        if not handles:
            return []
        shape, saved, options = self._items[handles[0]]
        if not coords:
            return list(saved)
        if len(coords) == 1 and isinstance(coords[0], (list, tuple)):
            coords = coords[0]
        if len(coords) >= 2 and len(coords) <= 400 and len(coords) % 2 == 0:
            self._items[handles[0]] = (shape, list(map(float, coords)), options)
            _changed()

    def move(self, search, x, y):
        for handle in self._matching(search):
            _, coords, _ = self._items[handle]
            for i, delta in enumerate(itertools.islice(itertools.cycle((float(x), float(y))), len(coords))):
                coords[i] += delta
        _changed()

    def find_all(self):
        return tuple(self._items)

    def _model(self):
        return super()._model() | {"items": [
            {"shape": shape, "coords": [_serializable(value) for value in coords],
             "options": {key: _serializable(options[key]) for key in
                         ("fill", "outline", "width", "text", "font", "anchor", "dash", "state") if key in options}}
            for shape, coords, options in self._items.values()
        ]}


def _dispatch(payload):
    global _dialog, _dialog_result
    try:
        data = json.loads(payload)
        event_name = data.get("event")
        if event_name == "dialog" and _dialog and data.get("id") == _dialog["id"]:
            _dialog_result, _dialog = data.get("value"), None
            return
        widget = _widgets.get(data.get("id"))
        if widget is None:
            return
        if event_name == "close" and isinstance(widget, Tk):
            _call(widget.protocol("WM_DELETE_WINDOW") or widget.destroy)
            return
        if widget.cget("state") == DISABLED:
            return
        event = Event(widget, data)
        names = {
            "invoke": ["<Button-1>", "<ButtonPress-1>", "<ButtonRelease-1>"],
            "pointer": ["<Button-1>", "<Button>", "<ButtonPress>", "<ButtonPress-1>"],
            "pointer-release": ["<ButtonRelease>", "<ButtonRelease-1>"],
            "drag": ["<B1-Motion>", "<Motion>"],
            "double": ["<Double-Button-1>"],
            "key": ["<Key>", "<KeyPress>", f"<{event.keysym}>", f"<KeyPress-{event.keysym}>"],
            "release": ["<KeyRelease>", f"<KeyRelease-{event.keysym}>"],
            "change": ["<<ComboboxSelected>>"] if isinstance(widget, Combobox) else ["<<ListboxSelect>>"],
        }.get(event_name, [])
        if event_name in ("input", "change"):
            serial = data.get("revision", 0)
            if isinstance(serial, int) and serial >= widget._revision:
                widget._revision = serial
                widget._input(data.get("value", ""), data)
        ancestor = widget
        notified = set()
        while ancestor is not None:
            for name in names:
                for handler in list(ancestor._bindings.get(name, ())):
                    if handler not in notified:
                        notified.add(handler)
                        if _call(handler, event) == "break":
                            return
            ancestor = ancestor.master
        for name in names:
            for handler in list(_global_bindings.get(name, ())):
                if handler not in notified:
                    notified.add(handler)
                    if _call(handler, event) == "break":
                        return
        if event_name == "invoke":
            widget._invoke()
    except Exception:
        traceback.print_exc()
    finally:
        _flush()


def mainloop():
    if _default_root is not None:
        _default_root.mainloop()


def _message(title, message, buttons, tone, blocking):
    global _dialog, _dialog_result
    if blocking and (_next_event is None or not _can_run_sync()):
        raise TclError("Діалог із відповіддю потребує підтримки синхронної паузи Python цим браузером.")
    _dialog_result = None
    _dialog = {"id": next(_ids), "title": str(title or ""), "message": str(message or ""),
               "buttons": buttons, "tone": tone}
    _flush()
    if _next_event is not None and _can_run_sync():
        while _dialog is not None:
            _dispatch(str(_run_sync(_next_event())))
    return _dialog_result or ("ok" if not blocking else "no")


def _info(tone):
    def show(title=None, message=None, **options):
        return _message(title, message, ["ok"], tone, False)
    return show


def _question(title=None, message=None, **options):
    return _message(title, message, ["yes", "no"], "info", True) == "yes"


ttk = types.ModuleType("tkinter.ttk")
for cls in (Frame, LabelFrame, Label, Button, Entry, Checkbutton, Radiobutton, Combobox, Progressbar, Scale,
            Spinbox, Separator):
    setattr(ttk, cls.__name__, cls)
ttk.Labelframe = LabelFrame

messagebox = types.ModuleType("tkinter.messagebox")
messagebox.showinfo = _info("info")
messagebox.showwarning = _info("warning")
messagebox.showerror = _info("error")
messagebox.askyesno = _question

font = types.ModuleType("tkinter.font")
font.Font = Font
for submodule in (ttk, messagebox, font):
    sys.modules[submodule.__name__] = submodule
