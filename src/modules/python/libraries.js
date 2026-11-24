export const libraries = {
  numpy:['NumPy','import numpy as np','Масиви та числові обчислення.'],
  sympy:['SymPy','import sympy as sp','Символьні обчислення. Також підключає mpmath.'],
  pillow:['Pillow','from PIL import Image','Обробка зображень.'],
  mpmath:['mpmath','import mpmath','Обчислення з високою точністю. Також вмикається разом із SymPy.'],
  tzdata:['Часові пояси','from zoneinfo import ZoneInfo','База часових поясів для zoneinfo.']
};

const storageKey = 'offline-informatyka:python-libraries';

export function normalizePackages(value) {
  return Array.isArray(value) ? Object.keys(libraries).filter(name=>value.includes(name)) : [];
}

export function readPackages() {
  try { return normalizePackages(JSON.parse(localStorage.getItem(storageKey))); }
  catch { return []; }
}

export function savePackages(packages) {
  localStorage.setItem(storageKey,JSON.stringify(normalizePackages(packages)));
}
