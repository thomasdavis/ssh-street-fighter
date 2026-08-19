import type { Key } from '../ui/key.js';

export const BINDABLE_ACTIONS = ['left', 'right', 'crouch', 'jump', 'jumpAlt', 'punch', 'kick', 'throw'] as const;
export type BindableAction = typeof BINDABLE_ACTIONS[number];

export type BindingToken =
  | 'arrow-left' | 'arrow-right' | 'arrow-up' | 'arrow-down'
  | `key:${string}`;

export type KeyBindings = Readonly<Record<BindableAction, BindingToken>>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = Object.freeze({
  left: 'arrow-left',
  right: 'arrow-right',
  crouch: 'arrow-down',
  jump: 'arrow-up',
  jumpAlt: 'key: ',
  punch: 'key:w',
  kick: 'key:e',
  throw: 'key:f',
});

export const ACTION_LABEL: Readonly<Record<BindableAction, string>> = {
  left: 'MOVE LEFT',
  right: 'MOVE RIGHT',
  crouch: 'CROUCH',
  jump: 'JUMP',
  jumpAlt: 'JUMP (ALT)',
  punch: 'PUNCH',
  kick: 'KICK',
  throw: 'THROW',
};

const ARROWS = new Set<BindingToken>(['arrow-left', 'arrow-right', 'arrow-up', 'arrow-down']);
const RESERVED = new Map([
  ['key:q', 'Q IS RESERVED FOR LEAVING A FIGHT'],
  ['key:v', 'V IS RESERVED FOR THE GRAPHICS MODE'],
  ['key:?', '? IS RESERVED FOR MOVE HELP'],
]);

export function isBindingToken(value: unknown): value is BindingToken {
  if (typeof value !== 'string') return false;
  if (ARROWS.has(value as BindingToken)) return true;
  return value.startsWith('key:') && value.length === 5 && value.charCodeAt(4) >= 0x20 && value.charCodeAt(4) < 0x7f;
}

export function bindingFromKey(key: Key): BindingToken | null {
  if (key.t === 'left' || key.t === 'right' || key.t === 'up' || key.t === 'down') return `arrow-${key.t}`;
  if (key.t === 'help') return 'key:?';
  if (key.t !== 'char') return null;
  const ch = key.ch.length === 1 ? key.ch.toLowerCase() : '';
  return ch && ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) < 0x7f ? `key:${ch}` : null;
}

export function bindingFromArrowCode(code: string | undefined): BindingToken | null {
  if (code === 'A') return 'arrow-up';
  if (code === 'B') return 'arrow-down';
  if (code === 'C') return 'arrow-right';
  if (code === 'D') return 'arrow-left';
  return null;
}

export function bindingFromChar(char: string): BindingToken | null {
  if (char.length !== 1) return null;
  const normalized = char.toLowerCase();
  return normalized.charCodeAt(0) >= 0x20 && normalized.charCodeAt(0) < 0x7f ? `key:${normalized}` : null;
}

export function bindingLabel(binding: BindingToken): string {
  if (binding === 'arrow-left') return '←';
  if (binding === 'arrow-right') return '→';
  if (binding === 'arrow-up') return '↑';
  if (binding === 'arrow-down') return '↓';
  const char = binding.slice(4);
  return char === ' ' ? 'SPACE' : char.toUpperCase();
}

export function bindingProblem(binding: BindingToken): string | null {
  return RESERVED.get(binding) ?? null;
}

export function actionUsing(bindings: KeyBindings, binding: BindingToken, except?: BindableAction): BindableAction | null {
  return BINDABLE_ACTIONS.find((action) => action !== except && bindings[action] === binding) ?? null;
}

export function withBinding(bindings: KeyBindings, action: BindableAction, binding: BindingToken): KeyBindings {
  return Object.freeze({ ...bindings, [action]: binding });
}

export function parseKeyBindings(raw: string | null | undefined): KeyBindings {
  if (!raw) return DEFAULT_KEY_BINDINGS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const parsed = {} as Record<BindableAction, BindingToken>;
    const seen = new Set<BindingToken>();
    for (const action of BINDABLE_ACTIONS) {
      const binding = value[action];
      // Keep the stored key when it's valid + unused; otherwise fall back to this
      // action's default. Per-action (not all-or-nothing) so older saves missing a
      // newly-added action like 'throw' keep their other custom keys.
      const chosen: BindingToken = (isBindingToken(binding) && !bindingProblem(binding) && !seen.has(binding))
        ? binding : DEFAULT_KEY_BINDINGS[action];
      parsed[action] = chosen;
      seen.add(chosen);
    }
    return Object.freeze(parsed);
  } catch {
    return DEFAULT_KEY_BINDINGS;
  }
}

export function serializeKeyBindings(bindings: KeyBindings): string {
  return JSON.stringify(bindings);
}

export function attackButtonLabels(bindings: KeyBindings): Readonly<Record<'punch' | 'kick', string>> {
  return { punch: bindingLabel(bindings.punch), kick: bindingLabel(bindings.kick) };
}
