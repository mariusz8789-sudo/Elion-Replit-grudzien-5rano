/**
 * Bezpieczny parser i ewaluator wyrażeń matematycznych — CELOWO bez
 * `eval()`/`Function()` (zero nowej powierzchni ataku): tokenizer →
 * parser rekurencyjnego zstępowania (recursive descent) → drzewo AST →
 * ewaluator z jawną listą dozwolonych funkcji/stałych. Wejście
 * użytkownika NIGDY nie dotyka silnika JS — to zwykłe dane strukturalne.
 *
 * Wspiera: +,-,*,/,^ (potęgowanie prawostronnie łączne), nawiasy,
 * niejawne mnożenie ("2x", "2sin(x)", "(x+1)(x-1)"), funkcje jednej
 * zmiennej (sin, cos, tan, sqrt, ln, exp, ...), stałe (pi, e).
 * Różniczkowanie symboliczne (standardowe reguły rachunku różniczkowego)
 * i całkowanie numeryczne (metoda Simpsona) — patrz niżej.
 */

export class MathParseError extends Error {}
export class MathEvalError extends Error {}

/* ---------------- Tokenizer ---------------- */

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma';
interface Token { type: TokenType; value: string }

const OPS = new Set(['+', '-', '*', '/', '^']);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      if (input[j] === 'e' || input[j] === 'E') {
        let k = j + 1;
        if (input[k] === '+' || input[k] === '-') k++;
        if (/[0-9]/.test(input[k] ?? '')) {
          j = k + 1;
          while (j < input.length && /[0-9]/.test(input[j])) j++;
        }
      }
      const raw = input.slice(i, j);
      if (!/^\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(raw) && !/^\d+\.?\d*(?:[eE][+-]?\d+)?$/.test(raw)) {
        throw new MathParseError(`Nieprawidłowa liczba: "${raw}"`);
      }
      tokens.push({ type: 'num', value: raw });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (OPS.has(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', value: c }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c }); i++; continue; }
    throw new MathParseError(`Nieznany znak: "${c}"`);
  }
  return tokens;
}

/* ---------------- AST ---------------- */

export type BinOp = '+' | '-' | '*' | '/' | '^';

export type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'bin'; op: BinOp; left: Node; right: Node }
  | { type: 'neg'; arg: Node }
  | { type: 'call'; name: string; args: Node[] };

export const numNode = (value: number): Node => ({ type: 'num', value });
export const varNode = (name: string): Node => ({ type: 'var', name });
export const binNode = (op: BinOp, left: Node, right: Node): Node => ({ type: 'bin', op, left, right });
export const negNode = (arg: Node): Node => ({ type: 'neg', arg });
export const callNode = (name: string, args: Node[]): Node => ({ type: 'call', name, args });

/* ---------------- Parser (recursive descent) ---------------- */

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new MathParseError('Nieoczekiwany koniec wyrażenia.');
    this.pos++;
    return t;
  }

  parse(): Node {
    const node = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new MathParseError(`Nieoczekiwany token: "${this.tokens[this.pos].value}"`);
    }
    return node;
  }

  private parseExpression(): Node {
    let node = this.parseTerm();
    while (this.peek()?.type === 'op' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.next().value as BinOp;
      node = binNode(op, node, this.parseTerm());
    }
    return node;
  }

  private parseTerm(): Node {
    let node = this.parseImplicitMul();
    while (this.peek()?.type === 'op' && (this.peek()!.value === '*' || this.peek()!.value === '/')) {
      const op = this.next().value as BinOp;
      node = binNode(op, node, this.parseImplicitMul());
    }
    return node;
  }

  /** Obsługa niejawnego mnożenia: "2x", "2 sin(x)", "(x+1)(x-1)". */
  private parseImplicitMul(): Node {
    let node = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t && (t.type === 'num' || t.type === 'ident' || t.type === 'lparen')) {
        node = binNode('*', node, this.parseUnary());
      } else break;
    }
    return node;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t?.type === 'op' && t.value === '-') { this.next(); return negNode(this.parseUnary()); }
    if (t?.type === 'op' && t.value === '+') { this.next(); return this.parseUnary(); }
    return this.parsePower();
  }

  /** ^ jest prawostronnie łączne: 2^3^2 = 2^(3^2); pozwala na wykładniki ujemne: x^-1. */
  private parsePower(): Node {
    const node = this.parsePrimary();
    if (this.peek()?.type === 'op' && this.peek()!.value === '^') {
      this.next();
      return binNode('^', node, this.parseUnary());
    }
    return node;
  }

  private parsePrimary(): Node {
    const t = this.next();
    if (t.type === 'num') return numNode(parseFloat(t.value));
    if (t.type === 'lparen') {
      const node = this.parseExpression();
      if (this.peek()?.type !== 'rparen') throw new MathParseError('Brakuje domykającego nawiasu ")".');
      this.next();
      return node;
    }
    if (t.type === 'ident') {
      if (this.peek()?.type === 'lparen') {
        this.next();
        const args = [this.parseExpression()];
        while (this.peek()?.type === 'comma') { this.next(); args.push(this.parseExpression()); }
        if (this.peek()?.type !== 'rparen') throw new MathParseError('Brakuje domykającego nawiasu ")" w wywołaniu funkcji.');
        this.next();
        return callNode(t.value, args);
      }
      return varNode(t.value);
    }
    throw new MathParseError(`Nieoczekiwany token: "${t.value}"`);
  }
}

export function parseExpression(input: string): Node {
  if (!input.trim()) throw new MathParseError('Puste wyrażenie.');
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}

/* ---------------- Ewaluator: jawna lista dozwolonych funkcji/stałych ---------------- */

export const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, max: Math.max, min: Math.min,
};

export const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function evaluate(node: Node, bindings: Record<string, number> = {}): number {
  switch (node.type) {
    case 'num': return node.value;
    case 'var': {
      if (node.name in bindings) return bindings[node.name];
      if (node.name in CONSTANTS) return CONSTANTS[node.name];
      throw new MathEvalError(`Nieznana zmienna: "${node.name}"`);
    }
    case 'neg': return -evaluate(node.arg, bindings);
    case 'bin': {
      const l = evaluate(node.left, bindings);
      const r = evaluate(node.right, bindings);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
      break;
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new MathEvalError(`Nieznana funkcja: "${node.name}"`);
      return fn(...node.args.map((a) => evaluate(a, bindings)));
    }
  }
  throw new MathEvalError('Nierozpoznany węzeł wyrażenia.');
}

/** Wygodny skrót: sparsuj i zbuduj funkcję liczbową f(x). */
export function compileUnary(expr: string, varName = 'x'): (x: number) => number {
  const ast = parseExpression(expr);
  return (x: number) => evaluate(ast, { [varName]: x });
}

/* ---------------- Zapis czytelny (infix) ---------------- */

function needsParens(child: Node, parentPrec: number, isRightOfMinusOrDiv: boolean): boolean {
  const p = precedence(child);
  if (p < parentPrec) return true;
  if (p === parentPrec && isRightOfMinusOrDiv) return true;
  return false;
}

function precedence(node: Node): number {
  if (node.type === 'bin') {
    if (node.op === '+' || node.op === '-') return 1;
    if (node.op === '*' || node.op === '/') return 2;
    if (node.op === '^') return 3;
  }
  if (node.type === 'neg') return 1.5;
  return 4;
}

export function nodeToString(node: Node): string {
  switch (node.type) {
    case 'num': {
      if (Number.isInteger(node.value)) return String(node.value);
      return Number(node.value.toFixed(6)).toString();
    }
    case 'var': return node.name;
    case 'neg': {
      const inner = nodeToString(node.arg);
      return precedence(node.arg) < 1.5 ? `-(${inner})` : `-${inner}`;
    }
    case 'call': return `${node.name}(${node.args.map(nodeToString).join(', ')})`;
    case 'bin': {
      const prec = precedence(node);
      const leftStr = needsParens(node.left, prec, false) ? `(${nodeToString(node.left)})` : nodeToString(node.left);
      const rightIsSpecial = node.op === '-' || node.op === '/';
      const rightStr = needsParens(node.right, prec, rightIsSpecial) ? `(${nodeToString(node.right)})` : nodeToString(node.right);
      return `${leftStr} ${node.op} ${rightStr}`;
    }
  }
}

/* ---------------- Podstawowe uproszczenia ---------------- */

export function simplify(node: Node): Node {
  if (node.type === 'neg') {
    const arg = simplify(node.arg);
    if (arg.type === 'num') return numNode(-arg.value);
    return negNode(arg);
  }
  if (node.type === 'bin') {
    const left = simplify(node.left);
    const right = simplify(node.right);
    if (left.type === 'num' && right.type === 'num') {
      switch (node.op) {
        case '+': return numNode(left.value + right.value);
        case '-': return numNode(left.value - right.value);
        case '*': return numNode(left.value * right.value);
        case '/': return numNode(left.value / right.value);
        case '^': return numNode(Math.pow(left.value, right.value));
      }
    }
    if (node.op === '+') {
      if (left.type === 'num' && left.value === 0) return right;
      if (right.type === 'num' && right.value === 0) return left;
    }
    if (node.op === '-' && right.type === 'num' && right.value === 0) return left;
    if (node.op === '*') {
      if ((left.type === 'num' && left.value === 0) || (right.type === 'num' && right.value === 0)) return numNode(0);
      if (left.type === 'num' && left.value === 1) return right;
      if (right.type === 'num' && right.value === 1) return left;
    }
    if (node.op === '/' && right.type === 'num' && right.value === 1) return left;
    if (node.op === '^') {
      if (right.type === 'num' && right.value === 1) return left;
      if (right.type === 'num' && right.value === 0) return numNode(1);
    }
    return binNode(node.op, left, right);
  }
  if (node.type === 'call') return callNode(node.name, node.args.map(simplify));
  return node;
}

/* ---------------- Różniczkowanie symboliczne ---------------- */

function containsVar(node: Node, v: string): boolean {
  switch (node.type) {
    case 'num': return false;
    case 'var': return node.name === v;
    case 'neg': return containsVar(node.arg, v);
    case 'bin': return containsVar(node.left, v) || containsVar(node.right, v);
    case 'call': return node.args.some((a) => containsVar(a, v));
  }
}

const SINGLE_ARG_DERIVATIVES: Record<string, (u: Node) => Node> = {
  sin: (u) => callNode('cos', [u]),
  cos: (u) => negNode(callNode('sin', [u])),
  tan: (u) => binNode('/', numNode(1), binNode('^', callNode('cos', [u]), numNode(2))),
  exp: (u) => callNode('exp', [u]),
  ln: (u) => binNode('/', numNode(1), u),
  sqrt: (u) => binNode('/', numNode(1), binNode('*', numNode(2), callNode('sqrt', [u]))),
  asin: (u) => binNode('/', numNode(1), callNode('sqrt', [binNode('-', numNode(1), binNode('^', u, numNode(2)))])),
  acos: (u) => negNode(binNode('/', numNode(1), callNode('sqrt', [binNode('-', numNode(1), binNode('^', u, numNode(2)))]))),
  atan: (u) => binNode('/', numNode(1), binNode('+', numNode(1), binNode('^', u, numNode(2)))),
  sinh: (u) => callNode('cosh', [u]),
  cosh: (u) => callNode('sinh', [u]),
  tanh: (u) => binNode('-', numNode(1), binNode('^', callNode('tanh', [u]), numNode(2))),
  abs: (u) => callNode('sign', [u]),
};

/**
 * Różniczkowanie symboliczne — standardowe reguły rachunku różniczkowego
 * (suma, iloczyn, iloraz, potęga, łańcuchowa). Ogólny przypadek f(x)^g(x)
 * (obie strony zależne od zmiennej) różniczkowany metodą logarytmiczną.
 */
export function differentiate(node: Node, v: string): Node {
  switch (node.type) {
    case 'num': return numNode(0);
    case 'var': return numNode(node.name === v ? 1 : 0);
    case 'neg': return negNode(differentiate(node.arg, v));
    case 'bin': {
      const { op, left, right } = node;
      if (op === '+') return binNode('+', differentiate(left, v), differentiate(right, v));
      if (op === '-') return binNode('-', differentiate(left, v), differentiate(right, v));
      if (op === '*') {
        return binNode('+', binNode('*', differentiate(left, v), right), binNode('*', left, differentiate(right, v)));
      }
      if (op === '/') {
        const num = binNode('-', binNode('*', differentiate(left, v), right), binNode('*', left, differentiate(right, v)));
        const den = binNode('^', right, numNode(2));
        return binNode('/', num, den);
      }
      // op === '^'
      const rightHasVar = containsVar(right, v);
      const leftHasVar = containsVar(left, v);
      if (!rightHasVar) {
        // reguła potęgowa: d/dx[u^n] = n*u^(n-1)*u'
        const nMinus1 = binNode('-', right, numNode(1));
        return binNode('*', binNode('*', right, binNode('^', left, nMinus1)), differentiate(left, v));
      }
      if (!leftHasVar) {
        // a^u, a stała: d/dx[a^u] = a^u * ln(a) * u'
        return binNode('*', binNode('*', node, callNode('ln', [left])), differentiate(right, v));
      }
      // ogólny f(x)^g(x): różniczkowanie logarytmiczne
      // d/dx[f^g] = f^g * (g'*ln(f) + g*f'/f)
      const lnF = callNode('ln', [left]);
      const term = binNode(
        '+',
        binNode('*', differentiate(right, v), lnF),
        binNode('*', right, binNode('/', differentiate(left, v), left)),
      );
      return binNode('*', node, term);
    }
    case 'call': {
      const rule = SINGLE_ARG_DERIVATIVES[node.name];
      if (!rule) throw new MathEvalError(`Brak reguły różniczkowania dla funkcji "${node.name}".`);
      if (node.args.length !== 1) throw new MathEvalError(`Różniczkowanie obsługuje tylko funkcje jednoargumentowe (${node.name} ma ${node.args.length}).`);
      const u = node.args[0];
      const uPrime = differentiate(u, v);
      return binNode('*', rule(u), uPrime);
    }
  }
}

export interface DiffStep { rule: string; before: string; after: string }

const RULE_NAMES: Record<string, string> = {
  sum: 'Reguła sumy: (f+g)′ = f′+g′',
  diff: 'Reguła różnicy: (f−g)′ = f′−g′',
  product: 'Reguła iloczynu: (f·g)′ = f′·g + f·g′',
  quotient: 'Reguła ilorazu: (f/g)′ = (f′·g − f·g′)/g²',
  power: 'Reguła potęgowa: (uⁿ)′ = n·u^(n−1)·u′',
  expBase: 'Pochodna funkcji wykładniczej o stałej podstawie: (aᵘ)′ = aᵘ·ln(a)·u′',
  logDiff: 'Różniczkowanie logarytmiczne (obie strony zależą od zmiennej)',
  chain: 'Reguła łańcuchowa',
  const: 'Pochodna stałej wynosi 0',
  varRule: 'Pochodna zmiennej: (x)′ = 1',
};

/**
 * Wersja `differentiate` generująca listę kroków do wyświetlenia
 * użytkownikowi — ta sama logika, dodatkowo opisana słownie na każdym
 * poziomie rekursji (post-order: najpierw podwyrażenia, potem reguła
 * łącząca je w całość, tak jak faktycznie liczy się pochodną ręcznie).
 */
export function differentiateWithSteps(node: Node, v: string): { result: Node; steps: DiffStep[] } {
  const steps: DiffStep[] = [];

  function go(n: Node): Node {
    switch (n.type) {
      case 'num':
        return numNode(0);
      case 'var': {
        const result = numNode(n.name === v ? 1 : 0);
        return result;
      }
      case 'neg': {
        const inner = go(n.arg);
        return negNode(inner);
      }
      case 'bin': {
        const { op, left, right } = n;
        if (op === '+' || op === '-') {
          const dLeft = go(left);
          const dRight = go(right);
          const result = binNode(op, dLeft, dRight);
          steps.push({
            rule: op === '+' ? RULE_NAMES.sum : RULE_NAMES.diff,
            before: nodeToString(n),
            after: nodeToString(simplify(result)),
          });
          return result;
        }
        if (op === '*') {
          const dLeft = go(left);
          const dRight = go(right);
          const result = binNode('+', binNode('*', dLeft, right), binNode('*', left, dRight));
          steps.push({ rule: RULE_NAMES.product, before: nodeToString(n), after: nodeToString(simplify(result)) });
          return result;
        }
        if (op === '/') {
          const dLeft = go(left);
          const dRight = go(right);
          const num = binNode('-', binNode('*', dLeft, right), binNode('*', left, dRight));
          const den = binNode('^', right, numNode(2));
          const result = binNode('/', num, den);
          steps.push({ rule: RULE_NAMES.quotient, before: nodeToString(n), after: nodeToString(simplify(result)) });
          return result;
        }
        // op === '^'
        const rightHasVar = containsVar(right, v);
        const leftHasVar = containsVar(left, v);
        if (!rightHasVar) {
          const dLeft = go(left);
          const nMinus1 = binNode('-', right, numNode(1));
          const result = binNode('*', binNode('*', right, binNode('^', left, nMinus1)), dLeft);
          steps.push({ rule: RULE_NAMES.power, before: nodeToString(n), after: nodeToString(simplify(result)) });
          return result;
        }
        if (!leftHasVar) {
          const dRight = go(right);
          const result = binNode('*', binNode('*', n, callNode('ln', [left])), dRight);
          steps.push({ rule: RULE_NAMES.expBase, before: nodeToString(n), after: nodeToString(simplify(result)) });
          return result;
        }
        const dLeft = go(left);
        const dRight = go(right);
        const lnF = callNode('ln', [left]);
        const term = binNode('+', binNode('*', dRight, lnF), binNode('*', right, binNode('/', dLeft, left)));
        const result = binNode('*', n, term);
        steps.push({ rule: RULE_NAMES.logDiff, before: nodeToString(n), after: nodeToString(simplify(result)) });
        return result;
      }
      case 'call': {
        const rule = SINGLE_ARG_DERIVATIVES[n.name];
        if (!rule) throw new MathEvalError(`Brak reguły różniczkowania dla funkcji "${n.name}".`);
        const u = n.args[0];
        const uPrime = go(u);
        const result = binNode('*', rule(u), uPrime);
        steps.push({ rule: `${RULE_NAMES.chain} (${n.name})`, before: nodeToString(n), after: nodeToString(simplify(result)) });
        return result;
      }
    }
  }

  const result = go(node);
  return { result: simplify(result), steps };
}

/* ---------------- Całkowanie numeryczne (Simpson) ---------------- */

/** Złożona kwadratura Simpsona — dokładna dla wielomianów stopnia ≤3, standardowa metoda numeryczna. */
export function simpsonIntegral(f: (x: number) => number, a: number, b: number, n = 1000): number {
  let steps = n % 2 === 0 ? n : n + 1;
  if (steps < 2) steps = 2;
  const h = (b - a) / steps;
  let sum = f(a) + f(b);
  for (let i = 1; i < steps; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * f(x);
  }
  return (sum * h) / 3;
}

/* ---------------- Szukanie pierwiastków (próbkowanie + bisekcja) ---------------- */

/**
 * Znajduje przybliżone pierwiastki f(x)=0 na [a,b]: próbkuje funkcję,
 * dla każdej zmiany znaku doprecyzowuje bisekcją. Nie znajdzie
 * pierwiastków parzystej krotności (styczne dotknięcie osi X bez zmiany
 * znaku) — udokumentowane ograniczenie tej metody, nie ukryte.
 */
export function findRoots(f: (x: number) => number, a: number, b: number, samples = 400): number[] {
  const roots: number[] = [];
  const step = (b - a) / samples;
  let xPrev = a;
  let fPrev = f(a);
  for (let i = 1; i <= samples; i++) {
    const x = a + i * step;
    const fx = f(x);
    if (Number.isFinite(fPrev) && Number.isFinite(fx)) {
      if (fPrev === 0) {
        roots.push(xPrev);
      } else if (fPrev * fx < 0) {
        let lo = xPrev;
        let hi = x;
        let flo = fPrev;
        for (let iter = 0; iter < 60; iter++) {
          const mid = (lo + hi) / 2;
          const fmid = f(mid);
          if (fmid === 0) { lo = hi = mid; break; }
          if (flo * fmid < 0) { hi = mid; } else { lo = mid; flo = fmid; }
        }
        roots.push((lo + hi) / 2);
      }
    }
    xPrev = x;
    fPrev = fx;
  }
  return roots;
}

/* ---------------- Równania różniczkowe: dy/dx = f(x,y), RK4 ---------------- */

export interface OdePoint { x: number; y: number }

/** Jeden krok RK4 — ta sama metoda numeryczna używana w całym Genesis OS (Lorenz, problem trzech ciał, geodezyjne). */
export function stepOdeRK4(f: (x: number, y: number) => number, x: number, y: number, h: number): OdePoint {
  const k1 = f(x, y);
  const k2 = f(x + h / 2, y + (h / 2) * k1);
  const k3 = f(x + h / 2, y + (h / 2) * k2);
  const k4 = f(x + h, y + h * k3);
  return { x: x + h, y: y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4) };
}

export function solveOde(f: (x: number, y: number) => number, x0: number, y0: number, xEnd: number, steps: number): OdePoint[] {
  const h = (xEnd - x0) / steps;
  const points: OdePoint[] = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  for (let i = 0; i < steps; i++) {
    const next = stepOdeRK4(f, x, y, h);
    x = next.x;
    y = next.y;
    if (!Number.isFinite(y)) break;
    points.push({ x, y });
  }
  return points;
}
