import { el } from '../../components/ui.js';

const example = (title, code, input = '') => ({ title, code: code.trim(), input });

const languageTopics = [
  {
    title: 'Перші команди',
    commands: [
      ['print(...)', 'Виводить результат у консоль. Передай кілька значень через кому.'],
      ['input("Запитання")', 'Показує запитання й повертає введений текст. У полі «Рядки для input()» можна підготувати по одній відповіді на рядок.'],
      ['name = значення', 'Зберігає значення під назвою, яку можна використати далі.'],
      ['# Коментар', 'Пояснює код. Python пропускає текст після # за межами лапок.'],
    ],
    examples: [example('Привітання', `
name = input("Як тебе звати? ")
grade = input("У якому ти класі? ")
print("Привіт,", name)
print("Ти навчаєшся у", grade, "класі.")
`, 'Оля\n6')],
  },
  {
    title: 'Типи й обчислення',
    commands: [
      ['int(текст), float(текст)', 'Перетворюють текст на ціле або дробове число. У дробовому числі використовуй крапку.'],
      ['str(значення), type(значення)', 'str() робить текст, а type() показує тип.'],
      ['True, False', 'Логічні значення, які використовують в умовах.'],
      ['+, -, *, /, //, %, **', 'Додавання, віднімання, множення, ділення, ціла частка, остача та степінь.'],
      ['round(число, знаки)', 'Округлює число до заданої кількості знаків після крапки.'],
    ],
    examples: [example('Ціна покупки', `
price = float("18.75")
count = int("3")
total = price * count
print("Разом:", round(total, 2))
print("Тип суми:", type(total).__name__)
`)],
  },
  {
    title: 'Умови',
    commands: [
      ['if умова:', 'Виконує блок з відступом, коли умова істинна.'],
      ['elif умова:', 'Перевіряє наступну умову, якщо попередні були хибні.'],
      ['else:', 'Виконує блок, якщо жодна умова вище не спрацювала.'],
      ['==, !=, <, <=, >, >=', 'Порівнюють значення й повертають True або False.'],
      ['and, or, not', 'Поєднують умови або змінюють їхнє логічне значення.'],
    ],
    examples: [example('Парне чи непарне', `
number = int(input("Ціле число: "))
if number == 0:
    print("Нуль")
elif number % 2 == 0:
    print("Парне")
else:
    print("Непарне")
`, '17')],
  },
  {
    title: 'Цикли',
    commands: [
      ['for item in послідовність:', 'Повторює дії для кожного елемента.'],
      ['range(початок, межа, крок)', 'Дає числа від початку до межі. Межа залишається поза діапазоном.'],
      ['while умова:', 'Повторює дії доти, доки умова істинна.'],
      ['break, continue', 'break завершує цикл, а continue переходить до наступного повторення.'],
    ],
    examples: [
      example('Сума чисел від 1 до 5', `
total = 0
for number in range(1, 6):
    total += number
print("Сума:", total)
`),
      example('Зворотний відлік', `
seconds = 3
while seconds > 0:
    print(seconds)
    seconds -= 1
print("Старт!")
`),
    ],
  },
  {
    title: 'Функції',
    commands: [
      ['def name(параметри):', 'Описує функцію. Її команди пишуть з відступом.'],
      ['return значення', 'Повертає результат і завершує роботу функції.'],
      ['name(аргументи)', 'Викликає функцію та передає їй потрібні значення.'],
    ],
    examples: [example('Площа прямокутника', `
def area(width, height):
    return width * height


print("Площа:", area(4, 7))
`)],
  },
  {
    title: 'Рядки',
    commands: [
      ['text[0], text[1:4]', 'Вибирають символ або частину рядка. Нумерація починається з нуля.'],
      ['len(text)', 'Показує кількість символів.'],
      ['text.strip(), text.lower()', 'Прибирають пробіли з країв і переводять літери у нижній регістр відповідно.'],
      ['text.split(), " ".join(слова)', 'Розбивають рядок на слова та з’єднують слова через пробіл.'],
      ['f"Привіт, {name}!"', 'Підставляє значення змінної прямо в рядок.'],
    ],
    examples: [example('Підрахунок слів', `
title = "  Моя перша програма  "
words = title.strip().split()
print(f"Слів: {len(words)}")
print(" · ".join(words))
`)],
  },
  {
    title: 'Списки, словники й множини',
    commands: [
      ['[a, b], items.append(x)', 'Список зберігає порядок елементів. append() додає елемент у кінець.'],
      ['len(items), sum(items), sorted(items)', 'Довжина списку, сума чисел і новий відсортований список.'],
      ['{"ключ": значення}, data.get(ключ)', 'Словник зберігає пари. get() повертає значення за ключем або None.'],
      ['data.items()', 'Дає пари ключ–значення для циклу.'],
      ['(a, b), {a, b}', 'Кортеж зберігає незмінну послідовність, а множина — унікальні елементи.'],
    ],
    examples: [example('Середня оцінка', `
grades = {"Інформатика": [10, 11]}
grades["Інформатика"].append(12)
for subject, marks in grades.items():
    average = sum(marks) / len(marks)
    print(f"{subject}: {average:.1f}")
`)],
  },
  {
    title: 'Стандартна бібліотека',
    commands: [
      ['import math', 'math.sqrt(x) обчислює корінь, а math.pi містить число π.'],
      ['import random', 'randint(a, b) обирає випадкове ціле число між a і b включно.'],
      ['from statistics import mean', 'mean() обчислює середнє арифметичне.'],
      ['from datetime import date', 'date створює дату. date.today() повертає сьогоднішню дату.'],
      ['import json', 'json.dumps() перетворює об’єкт на текст JSON, а json.loads() читає його.'],
      ['from collections import Counter', 'Counter рахує, скільки разів зустрічається кожен елемент.'],
      ['from itertools import combinations', 'combinations() перебирає поєднання заданої довжини.'],
    ],
    examples: [
      example('Корінь, кубик і середнє', `
import math
import random
from statistics import mean

print("Корінь:", math.sqrt(81))
print("Кубик:", random.randint(1, 6))
print("Середнє:", mean([8, 10, 12]))
`),
      example('Дата й дані JSON', `
from datetime import date
import json

data = {"дата": date.today().isoformat(), "предмет": "Інформатика"}
text = json.dumps(data, ensure_ascii=False)
print(text)
print(json.loads(text)["предмет"])
`),
      example('Частота й поєднання', `
from collections import Counter
from itertools import combinations

print(Counter(["яблуко", "груша", "яблуко"]))
print(list(combinations(["Анна", "Іван", "Оля"], 2)))
`),
    ],
  },
  {
    title: 'Файли й власні модулі',
    note: 'Створюй файли командою «Новий файл» або завантажуй їх через «Додати файли…». Файли, які програма створює через open(), доступні в межах поточного запуску.',
    commands: [
      ['with open(ім’я, режим, encoding="utf-8") as file:', 'Відкриває текстовий файл і автоматично закриває його після блоку.'],
      ['"r", "w", "a"', 'Режими читання, перезапису й дописування в кінець файла.'],
      ['file.read(), file.write(текст)', 'Читають і записують текст.'],
      ['import helper', 'Додай файл helper.py до роботи й підключи його з основної програми. Викликай функцію з нього як helper.назва().'],
    ],
    examples: [example('Запис і читання нотатки', `
with open("notes.txt", "w", encoding="utf-8") as file:
    file.write("Моя перша нотатка")

with open("notes.txt", "r", encoding="utf-8") as file:
    print(file.read())
`)],
  },
];

const graphicsTopics = [
  {
    title: 'Tkinter. Вікно й віджети',
    note: 'Браузерна версія Tkinter підтримує віджети для навчальних прикладів.',
    commands: [
      ['import tkinter as tk, tk.Tk()', 'Підключає бібліотеку й створює головне вікно.'],
      ['tk.Label(), tk.Entry(), tk.Button()', 'Створюють напис, поле введення і кнопку.'],
      ['tk.Frame()', 'Створює контейнер для групи віджетів.'],
      ['tk.Checkbutton(), tk.Radiobutton()', 'Створюють прапорець або один варіант зі спільного набору.'],
      ['from tkinter import ttk, messagebox', 'ttk додає оформлені віджети. messagebox.showinfo() показує повідомлення.'],
      ['pack(), grid(row=…, column=…), place(x=…, y=…)', 'Розташовують віджети один за одним, у сітці або за координатами. Для одного контейнера обери один спосіб.'],
      ['entry.get(), label.config(text=...)', 'Отримує текст із поля й оновлює напис.'],
      ['command=назва_функції', 'Передає функцію, яку Tkinter викличе після натискання кнопки.'],
      ['root.mainloop()', 'Запускає обробку подій вікна. Додай виклик наприкінці програми.'],
    ],
    examples: [example('Форма привітання', `
import tkinter as tk

root = tk.Tk()
root.title("Привітання")

form = tk.Frame(root)
form.pack(padx=12, pady=12)
tk.Label(form, text="Твоє ім’я").grid(row=0, column=0)
entry = tk.Entry(form)
entry.grid(row=1, column=0)
result = tk.Label(form, text="")
result.grid(row=3, column=0)

def greet():
    name = entry.get().strip() or "друже"
    result.config(text=f"Привіт, {name}!")

tk.Button(form, text="Привітати", command=greet).grid(row=2, column=0)
root.mainloop()
`)],
  },
  {
    title: 'Tkinter. Полотно й події',
    commands: [
      ['tk.Canvas()', 'Створює полотно. Координата (0, 0) знаходиться у верхньому лівому куті.'],
      ['create_line(), create_rectangle(), create_oval()', 'Малюють лінії, прямокутники та еліпси. fill задає колір заливки.'],
      ['widget.bind("<Button-1>", функція)', 'Викликає функцію при натисканні. event.x і event.y містять координати.'],
      ['root.after(мілісекунди, функція)', 'Викликає функцію після затримки. 1000 мілісекунд — одна секунда.'],
      ['tk.StringVar(), widget(textvariable=...)', 'Пов’язує текст віджета зі змінною. get() читає значення, а set() змінює його.'],
    ],
    examples: [
      example('Малювання дотиком', `
import tkinter as tk

root = tk.Tk()
root.title("Полотно")
tk.Label(root, text="Торкнися полотна, щоб додати крапку").pack()
canvas = tk.Canvas(root, width=260, height=180, bg="white")
canvas.pack(padx=8, pady=8)

def dot(event):
    x, y = event.x, event.y
    canvas.create_oval(x - 5, y - 5, x + 5, y + 5, fill="#3478d8", outline="")

canvas.bind("<Button-1>", dot)
root.mainloop()
`),
      example('Три секунди', `
import tkinter as tk

root = tk.Tk()
root.title("Таймер")
remaining = tk.StringVar(value="3")
tk.Label(root, textvariable=remaining).pack(padx=16, pady=16)

def tick():
    value = int(remaining.get()) - 1
    if value > 0:
        remaining.set(str(value))
        root.after(1000, tick)
    else:
        remaining.set("Готово!")

root.after(1000, tick)
root.mainloop()
`),
    ],
  },
  {
    title: 'Типові помилки',
    commands: [
      ['SyntaxError', 'Перевір двокрапки після if, for і def, а також пари лапок і дужок.'],
      ['IndentationError', 'Вирівняй команди одного блоку на однаковий відступ. Зазвичай це 4 пробіли.'],
      ['NameError', 'Перевір назву змінної та знайди рядок, де вона має отримати значення.'],
      ['TypeError, ValueError', 'Перевір типи й значення. Наприклад, int("кіт") дає ValueError.'],
      ['ModuleNotFoundError', 'Перевір написання import і наявність модуля в цьому середовищі.'],
      ['try: … except …:', 'Обробляє конкретну помилку. У консолі назва помилки й номер рядка допомагають знайти причину.'],
    ],
    examples: [example('Перевірка введення', `
try:
    number = int(input("Введи ціле число: "))
    print("Квадрат:", number ** 2)
except ValueError:
    print("Потрібне ціле число, наприклад 12.")
`, 'кіт')],
  },
];

const additionalPackages = {
  numpy: {
    command: ['import numpy as np', 'Масиви чисел. np.array() створює масив, а масив * 2 подвоює кожен елемент.'],
    example: example('NumPy. Обчислення з масивом', `
import numpy as np

scores = np.array([3, 6, 9])
print(scores * 2)
print("Середнє:", scores.mean())
`),
  },
  sympy: {
    command: ['from sympy import symbols, solve', 'symbols() створює символічну змінну, а solve() знаходить розв’язки рівняння.'],
    example: example('SymPy. Розв’язання рівняння', `
from sympy import Eq, solve, symbols

x = symbols("x")
print(solve(Eq(2 * x + 4, 14), x))
`),
  },
  pillow: {
    command: ['from PIL import Image', 'Відкриває інструменти для створення та обробки растрових зображень.'],
    example: example('Pillow. Створення зображення', `
from PIL import Image

picture = Image.new("RGB", (32, 24), "royalblue")
print("Розмір:", picture.size)
print("Колір пікселя:", picture.getpixel((0, 0)))
`),
  },
};

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('uk').replace(/[ʼ’]/g, "'");
}

export function createGuide({ onExample, packages = Object.keys(additionalPackages) }) {
  const topics = [...languageTopics];
  const extras = packages.map(name => additionalPackages[name]).filter(Boolean);
  if (extras.length) topics.push({
    title: 'Додаткові бібліотеки',
    note: 'Меню «Файл → Бібліотеки» вставляє команду імпорту перед поточним рядком.',
    commands: extras.map(item => item.command),
    examples: extras.map(item => item.example),
  });
  topics.push(...graphicsTopics);

  const search = el('input', {
    type: 'search', placeholder: 'Пошук команди чи теми',
    'aria-label': 'Пошук команди чи теми', autocomplete: 'off',
  });
  const noResults = el('p', { className: 'python-guide-empty', role: 'status', hidden: true }, 'Нічого не знайдено.');
  const entries = topics.map(topic => {
    const definitions = el('dl', { className: 'python-guide-commands' }, ...topic.commands.flatMap(([command, explanation]) => [
      el('dt', { className: 'python-guide-command' }, el('code', {}, command)),
      el('dd', {}, explanation),
    ]));
    const examples = topic.examples.map(sample => el('section', { className: 'python-guide-example' },
      el('h3', {}, sample.title),
      el('pre', { tabindex: '0', 'aria-label': sample.title }, el('code', {}, sample.code)),
      el('button', {
        type: 'button',
        'aria-label': 'Відкрити приклад «' + sample.title + '» у редакторі',
        onClick: () => onExample(sample),
      }, 'У редактор'),
    ));
    const node = el('details', { className: 'python-guide-topic' },
      el('summary', {}, topic.title),
      el('div', { className: 'python-guide-topic-body' }, topic.note ? el('p', {}, topic.note) : null, definitions, ...examples),
    );
    return {
      node,
      searchable: normalize([topic.title, topic.note, ...topic.commands.flat(), ...topic.examples.flatMap(({ title, code }) => [title, code])].join(' ')),
    };
  });
  let openBeforeSearch;
  search.addEventListener('input', () => {
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    if (terms.length && !openBeforeSearch) openBeforeSearch = entries.map(({ node }) => node.open);

    let count = 0;
    for (const [index, { node, searchable }] of entries.entries()) {
      const visible = terms.every(term => searchable.includes(term));
      node.hidden = !visible;
      if (visible) count++;
      if (terms.length) node.open = visible;
      else if (openBeforeSearch) node.open = openBeforeSearch[index];
    }
    if (!terms.length) openBeforeSearch = undefined;
    noResults.hidden = count > 0;
  });
  return el('section', { className: 'python-guide', 'aria-label': 'Довідка Python' },
    el('div', { className: 'python-guide-search', role: 'search' }, search),
    el('div', { className: 'python-guide-list' }, ...entries.map(({ node }) => node)),
    noResults,
  );
}
