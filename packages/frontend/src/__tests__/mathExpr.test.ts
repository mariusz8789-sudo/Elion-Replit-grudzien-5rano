import { describe, expect, it } from 'vitest';
import {
  compileUnary,
  differentiate,
  differentiateWithSteps,
  evaluate,
  findRoots,
  MathEvalError,
  MathParseError,
  nodeToString,
  parseExpression,
  simplify,
  simpsonIntegral,
  solveOde,
} from '../core/mathExpr';

describe('parser i ewaluator — bezpieczeństwo (BRAK eval/Function)', () => {
  it('respektuje kolejność działań: 2+3*4 = 14', () => {
    expect(evaluate(parseExpression('2+3*4'))).toBeCloseTo(14, 9);
  });

  it('nawiasy nadpisują kolejność: (2+3)*4 = 20', () => {
    expect(evaluate(parseExpression('(2+3)*4'))).toBeCloseTo(20, 9);
  });

  it('potęgowanie jest prawostronnie łączne: 2^3^2 = 2^(3^2) = 512', () => {
    expect(evaluate(parseExpression('2^3^2'))).toBeCloseTo(512, 9);
  });

  it('minus unarny wiąże słabiej niż potęga: -2^2 = -(2^2) = -4', () => {
    expect(evaluate(parseExpression('-2^2'))).toBeCloseTo(-4, 9);
  });

  it('ujemny wykładnik działa: x^-1 przy x=4 daje 0,25', () => {
    expect(evaluate(parseExpression('x^-1'), { x: 4 })).toBeCloseTo(0.25, 9);
  });

  it('niejawne mnożenie: 2x przy x=3 daje 6', () => {
    expect(evaluate(parseExpression('2x'), { x: 3 })).toBeCloseTo(6, 9);
  });

  it('niejawne mnożenie z funkcją: 2sin(0) daje 0', () => {
    expect(evaluate(parseExpression('2sin(0)'))).toBeCloseTo(0, 9);
  });

  it('niejawne mnożenie dwóch nawiasów: (x+1)(x-1) przy x=3 daje 8', () => {
    expect(evaluate(parseExpression('(x+1)(x-1)'), { x: 3 })).toBeCloseTo(8, 9);
  });

  it('2x^2 to 2*(x^2), nie (2x)^2 — przy x=3: 18, nie 36', () => {
    expect(evaluate(parseExpression('2x^2'), { x: 3 })).toBeCloseTo(18, 9);
  });

  it('funkcje trygonometryczne i stałe: sin(pi/2)=1, cos(0)=1', () => {
    expect(evaluate(parseExpression('sin(pi/2)'))).toBeCloseTo(1, 9);
    expect(evaluate(parseExpression('cos(0)'))).toBeCloseTo(1, 9);
  });

  it('ln(e)=1, sqrt(4)=2, exp(0)=1', () => {
    expect(evaluate(parseExpression('ln(e)'))).toBeCloseTo(1, 9);
    expect(evaluate(parseExpression('sqrt(4)'))).toBeCloseTo(2, 9);
    expect(evaluate(parseExpression('exp(0)'))).toBeCloseTo(1, 9);
  });

  it('rzuca MathParseError dla niepoprawnej składni (operator bez operandu)', () => {
    expect(() => parseExpression('2+*3')).toThrow(MathParseError);
  });

  it('rzuca MathParseError dla niedomkniętego nawiasu', () => {
    expect(() => parseExpression('(2+3')).toThrow(MathParseError);
  });

  it('rzuca MathEvalError dla nieznanej zmiennej (nie ma jej w bindings ani w CONSTANTS)', () => {
    expect(() => evaluate(parseExpression('y'), {})).toThrow(MathEvalError);
  });

  it('rzuca MathEvalError dla nieznanej funkcji — parser akceptuje strukturę, ewaluator odrzuca nazwę (biała lista, nie eval)', () => {
    const ast = parseExpression('foo(x)');
    expect(() => evaluate(ast, { x: 1 })).toThrow(MathEvalError);
  });

  it('rzuca MathParseError dla pustego wyrażenia', () => {
    expect(() => parseExpression('')).toThrow(MathParseError);
  });

  it('rzuca MathParseError dla nieznanego znaku (np. "@")', () => {
    expect(() => parseExpression('2@3')).toThrow(MathParseError);
  });
});

describe('nodeToString — zapis czytelny', () => {
  it('nie dodaje zbędnych nawiasów dla prostych wyrażeń', () => {
    expect(nodeToString(parseExpression('x+1'))).toBe('x + 1');
  });

  it('dodaje nawiasy tam, gdzie zmieniłyby wynik: (x+1)*2', () => {
    const s = nodeToString(parseExpression('(x+1)*2'));
    expect(evaluate(parseExpression(s), { x: 3 })).toBeCloseTo(evaluate(parseExpression('(x+1)*2'), { x: 3 }), 9);
  });
});

describe('simplify — podstawowe uproszczenia', () => {
  it('oblicza stałe wyrażenia: 2+3 -> 5', () => {
    const s = simplify(parseExpression('2+3'));
    expect(s).toEqual({ type: 'num', value: 5 });
  });

  it('x+0 upraszcza się do x', () => {
    expect(nodeToString(simplify(parseExpression('x+0')))).toBe('x');
  });

  it('x*1 upraszcza się do x, x*0 do 0', () => {
    expect(nodeToString(simplify(parseExpression('x*1')))).toBe('x');
    expect(nodeToString(simplify(parseExpression('x*0')))).toBe('0');
  });
});

describe('różniczkowanie symboliczne — zweryfikowane przeciw znanym dokładnym pochodnym', () => {
  const dAt = (expr: string, x: number): number => evaluate(differentiate(parseExpression(expr), 'x'), { x });

  it('d/dx[x^2] = 2x — przy x=3: 6', () => {
    expect(dAt('x^2', 3)).toBeCloseTo(6, 6);
  });

  it('d/dx[x^3+2x] = 3x^2+2 — przy x=2: 14', () => {
    expect(dAt('x^3+2x', 2)).toBeCloseTo(14, 6);
  });

  it('d/dx[sin(x)] = cos(x) — przy x=0: 1; przy x=pi/2: ~0', () => {
    expect(dAt('sin(x)', 0)).toBeCloseTo(1, 6);
    expect(dAt('sin(x)', Math.PI / 2)).toBeCloseTo(0, 6);
  });

  it('reguła iloczynu: d/dx[x*sin(x)] = sin(x)+x*cos(x)', () => {
    for (const x of [0, 1, 2, -1.5]) {
      const expected = Math.sin(x) + x * Math.cos(x);
      expect(dAt('x*sin(x)', x)).toBeCloseTo(expected, 6);
    }
  });

  it('reguła ilorazu: d/dx[sin(x)/x] zgadza się z ilorazową formułą analityczną', () => {
    for (const x of [1, 2, 0.5]) {
      const expected = (Math.cos(x) * x - Math.sin(x)) / (x * x);
      expect(dAt('sin(x)/x', x)).toBeCloseTo(expected, 6);
    }
  });

  it('reguła łańcuchowa: d/dx[sin(x^2)] = cos(x^2)*2x', () => {
    for (const x of [0.5, 1, 2]) {
      const expected = Math.cos(x * x) * 2 * x;
      expect(dAt('sin(x^2)', x)).toBeCloseTo(expected, 6);
    }
  });

  it('stała podstawa, zmienny wykładnik: d/dx[2^x] = 2^x*ln(2)', () => {
    for (const x of [0, 1, 2]) {
      const expected = Math.pow(2, x) * Math.log(2);
      expect(dAt('2^x', x)).toBeCloseTo(expected, 6);
    }
  });

  it('ogólny przypadek f(x)^g(x): d/dx[x^x] = x^x*(ln(x)+1) — przy x=2', () => {
    const expected = Math.pow(2, 2) * (Math.log(2) + 1);
    expect(dAt('x^x', 2)).toBeCloseTo(expected, 6);
  });

  it('spójność wewnętrzna: pochodna symboliczna zgadza się z różnicą centralną dla wielu wyrażeń (niezależna kontrola)', () => {
    const exprs = ['x^3 - 2x^2 + x', 'sin(x)*cos(x)', 'exp(x)/x', 'sqrt(x^2+1)', 'tan(x)*x'];
    for (const expr of exprs) {
      const f = compileUnary(expr);
      const symbolic = differentiate(parseExpression(expr), 'x');
      for (const x of [0.7, 1.3, 2.1]) {
        const h = 1e-6;
        const numeric = (f(x + h) - f(x - h)) / (2 * h);
        const analytic = evaluate(symbolic, { x });
        expect(analytic).toBeCloseTo(numeric, 3);
      }
    }
  });

  it('differentiateWithSteps zwraca niepustą listę kroków i wynik zgodny z differentiate()', () => {
    const { result, steps } = differentiateWithSteps(parseExpression('x^2*sin(x)'), 'x');
    expect(steps.length).toBeGreaterThan(0);
    expect(evaluate(result, { x: 1 })).toBeCloseTo(evaluate(differentiate(parseExpression('x^2*sin(x)'), 'x'), { x: 1 }), 6);
  });
});

describe('simpsonIntegral — całkowanie numeryczne (metoda Simpsona)', () => {
  it('∫₀¹ x² dx = 1/3 dokładnie (znana całka)', () => {
    expect(simpsonIntegral((x) => x * x, 0, 1, 1000)).toBeCloseTo(1 / 3, 6);
  });

  it('∫₀^π sin(x) dx = 2 dokładnie (znana całka)', () => {
    expect(simpsonIntegral(Math.sin, 0, Math.PI, 1000)).toBeCloseTo(2, 6);
  });

  it('∫₀⁵ 1 dx = 5 dokładnie (stała funkcja, pole prostokąta)', () => {
    expect(simpsonIntegral(() => 1, 0, 5, 100)).toBeCloseTo(5, 9);
  });
});

describe('findRoots — szukanie pierwiastków (próbkowanie + bisekcja)', () => {
  it('znajduje oba pierwiastki x²-4=0 (x=-2, x=2)', () => {
    const roots = findRoots((x) => x * x - 4, -5, 5);
    expect(roots.length).toBe(2);
    expect(roots.some((r) => Math.abs(r + 2) < 0.01)).toBe(true);
    expect(roots.some((r) => Math.abs(r - 2) < 0.01)).toBe(true);
  });

  it('znajduje pierwiastek sin(x)=0 blisko pi', () => {
    const roots = findRoots(Math.sin, 3, 3.3);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.some((r) => Math.abs(r - Math.PI) < 0.01)).toBe(true);
  });
});

describe('solveOde (RK4) — zweryfikowane przeciw znanym rozwiązaniom analitycznym', () => {
  it('dy/dx=y, y(0)=1 -> y(x)=e^x (wzrost wykładniczy)', () => {
    const points = solveOde((_x, y) => y, 0, 1, 2, 2000);
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(2, 6);
    expect(last.y).toBeCloseTo(Math.exp(2), 3);
  });

  it('dy/dx=-y, y(0)=1 -> y(x)=e^-x (rozpad wykładniczy)', () => {
    const points = solveOde((_x, y) => -y, 0, 1, 3, 2000);
    const last = points[points.length - 1];
    expect(last.y).toBeCloseTo(Math.exp(-3), 3);
  });

  it('dy/dx=2x, y(0)=0 -> y(x)=x^2 (całka wielomianowa)', () => {
    const points = solveOde((x) => 2 * x, 0, 0, 3, 1000);
    const last = points[points.length - 1];
    expect(last.y).toBeCloseTo(9, 3);
  });

  it('zatrzymuje się, jeśli y przestaje być skończone (nie zawiesza się na NaN/Infinity)', () => {
    const points = solveOde((_x, y) => y * y, 0, 1, 10, 5000); // eksploduje w skończonym czasie
    expect(points.every((p) => Number.isFinite(p.y))).toBe(true);
  });
});
