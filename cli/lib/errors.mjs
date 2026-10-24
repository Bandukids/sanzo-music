export class CliError extends Error {
  constructor(message, {code = 'INPUT', exitCode = 2, status, details} = {}) {
    super(message);
    Object.assign(this, {code, exitCode, status, details});
  }
}

export function required(value, name) {
  if (value === undefined || value === '') throw new CliError(`缺少 ${name}。`);
  return value;
}

export function choice(value, values, name) {
  if (!values.includes(value)) throw new CliError(`${name} 必须是 ${values.join(' / ')}。`);
  return value;
}

export function number(value, name, {min = 0, max = Number.MAX_SAFE_INTEGER, integer = true} = {}) {
  const n = Number(value);
  if (value === '' || !Number.isFinite(n) || (integer && !Number.isSafeInteger(n)) || n < min || n > max) {
    throw new CliError(`${name} 必须是 ${min}–${max} 范围内的${integer ? '整数' : '数值'}。`);
  }
  return n;
}

export function identifier(value, name = 'ID', uuid = false) {
  required(value, name);
  if (!(uuid ? /^[a-f0-9-]{36}$/ : /^[a-zA-Z0-9_-]{1,120}$/).test(value)) throw new CliError(`${name} 格式无效。`);
  return value;
}
