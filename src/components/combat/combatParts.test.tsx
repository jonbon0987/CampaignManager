import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Combatant } from '../../lib/combat';
import { HpControl } from './HpControl';
import { DeathSavePips } from './DeathSavePips';
import { ConditionChips } from './ConditionChips';

const make = (over: Partial<Combatant> = {}): Combatant => ({
  id: 'c1', name: 'Mage', initiative: 15, dexMod: 2, maxHp: 30, currentHp: 18, temp: 0, deathSaves: { s: 0, f: 0 }, ac: 12,
  conditions: [], rounds: {}, conCheck: null, isPC: false, statblockId: null, notes: null,
  ...over,
} as Combatant);

describe('HpControl', () => {
  const setup = (c = make()) => {
    const h = { onDamage: vi.fn(), onHeal: vi.fn(), onTemp: vi.fn(), onSetMax: vi.fn() };
    render(<HpControl combatant={c} {...h}><span>AC 12</span></HpControl>);
    return { ...h, amount: screen.getByLabelText('Amount for Mage') as HTMLInputElement };
  };

  it('disables the buttons until there is an amount, then clears it after use', () => {
    const { onDamage, onHeal, onTemp, amount } = setup();
    expect((screen.getByRole('button', { name: 'Dmg' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(amount, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dmg' }));
    expect(onDamage).toHaveBeenCalledWith(7);
    expect(amount.value).toBe('');
    fireEvent.change(amount, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Heal' }));
    fireEvent.change(amount, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Temp' }));
    expect(onHeal).toHaveBeenCalledWith(3);
    expect(onTemp).toHaveBeenCalledWith(5);
  });

  it('deals damage on Enter and heals on Shift+Enter; ignores zero', () => {
    const { onDamage, onHeal, amount } = setup();
    fireEvent.change(amount, { target: { value: '0' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    expect(onDamage).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '4' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    fireEvent.change(amount, { target: { value: '2' } });
    fireEvent.keyDown(amount, { key: 'Enter', shiftKey: true });
    expect(onDamage).toHaveBeenCalledWith(4);
    expect(onHeal).toHaveBeenCalledWith(2);
  });

  it('offers Max only while there is no max HP, and renders trailing content', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Max' })).toBeNull();
    expect(screen.getByText('AC 12')).toBeTruthy();
  });

  it('sets max HP when the combatant has none', () => {
    const { onSetMax, amount } = setup(make({ maxHp: 0, currentHp: 0 }));
    fireEvent.change(amount, { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(onSetMax).toHaveBeenCalledWith(22);
  });
});

describe('DeathSavePips', () => {
  it('fills up to an empty pip and clears back to just below a filled one', () => {
    const onSet = vi.fn();
    render(<DeathSavePips successes={1} failures={2} onSet={onSet} />);
    expect(screen.getByLabelText('Saves: 1 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saves 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Saves 2' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Saves 3' }));
    expect(onSet).toHaveBeenLastCalledWith('s', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Saves 1' }));
    expect(onSet).toHaveBeenLastCalledWith('s', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Fails 2' }));
    expect(onSet).toHaveBeenLastCalledWith('f', 1);
  });

  it('marks filled pips by kind', () => {
    render(<DeathSavePips successes={1} failures={1} onSet={() => {}} />);
    expect(screen.getByRole('button', { name: 'Saves 1' }).className).toContain('is-s on');
    expect(screen.getByRole('button', { name: 'Fails 1' }).className).toContain('is-f on');
  });
});

describe('ConditionChips', () => {
  it('shows each condition as a chip with its rounds left; clicking clears it', () => {
    const onToggle = vi.fn();
    render(<ConditionChips combatant={make({ conditions: ['frightened', 'prone'], rounds: { frightened: 2 } })} onToggle={onToggle} onSetRounds={vi.fn()} />);
    const chip = screen.getByRole('button', { name: 'Clear frightened' });
    expect(chip.textContent).toContain('· 2');
    expect(chip.title).toMatch(/2 rounds left/);
    fireEvent.click(screen.getByRole('button', { name: 'Clear prone' }));
    expect(onToggle).toHaveBeenCalledWith('prone');
  });

  it('adds a condition until cleared, or for the rounds given', () => {
    const onToggle = vi.fn();
    const onSetRounds = vi.fn();
    render(<ConditionChips combatant={make({ conditions: ['prone'] })} onToggle={onToggle} onSetRounds={onSetRounds} />);
    const select = screen.getByLabelText('Add a condition to Mage') as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).not.toContain('prone');
    fireEvent.change(select, { target: { value: 'blinded' } });
    expect(onToggle).toHaveBeenCalledWith('blinded');
    fireEvent.change(screen.getByLabelText('Rounds for the next condition on Mage'), { target: { value: '3' } });
    fireEvent.change(select, { target: { value: 'stunned' } });
    expect(onSetRounds).toHaveBeenCalledWith('stunned', 3);
    expect((screen.getByLabelText('Rounds for the next condition on Mage') as HTMLInputElement).value).toBe('');
  });

  it('hides the rounds field when rounds are not supported', () => {
    render(<ConditionChips combatant={make()} onToggle={vi.fn()} />);
    expect(screen.queryByLabelText('Rounds for the next condition on Mage')).toBeNull();
  });
});
