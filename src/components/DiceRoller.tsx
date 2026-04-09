import { useState, useRef, useEffect, useCallback } from 'react';
import { colors } from '../lib/theme';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RollResult {
  id: number;
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
  timestamp: Date;
}

// ─── Dice helpers ───────────────────────────────────────────────────────────

const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Parse notation like "2d6+3", "1d20-1", "d8", "4d6" */
function parseNotation(input: string): { count: number; sides: number; modifier: number } | null {
  const match = input.trim().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!match) return null;
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0;
  if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
  return { count, sides, modifier };
}

function executeRoll(count: number, sides: number, modifier: number): { rolls: number[]; total: number } {
  const rolls = Array.from({ length: count }, () => rollDie(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { rolls, total };
}

let nextId = 1;

// ─── Component ──────────────────────────────────────────────────────────────

interface DiceRollerProps {
  open: boolean;
  onClose: () => void;
}

export default function DiceRoller({ open, onClose }: DiceRollerProps) {
  const [history, setHistory] = useState<RollResult[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [parseError, setParseError] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Scroll history to bottom on new roll
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const addRoll = useCallback((notation: string, count: number, sides: number, modifier: number) => {
    const { rolls, total } = executeRoll(count, sides, modifier);
    setHistory(prev => {
      const next = [...prev, { id: nextId++, notation, rolls, modifier, total, timestamp: new Date() }];
      // Keep last 50 rolls
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  const handleQuickRoll = useCallback((sides: number) => {
    addRoll(`1d${sides}`, 1, sides, 0);
  }, [addRoll]);

  const handleCustomRoll = useCallback(() => {
    setParseError('');
    const parsed = parseNotation(customInput);
    if (!parsed) {
      setParseError('Invalid notation. Try: 2d6+3, 1d20, d8');
      return;
    }
    const modStr = parsed.modifier > 0 ? `+${parsed.modifier}` : parsed.modifier < 0 ? `${parsed.modifier}` : '';
    addRoll(`${parsed.count}d${parsed.sides}${modStr}`, parsed.count, parsed.sides, parsed.modifier);
    setCustomInput('');
  }, [customInput, addRoll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomRoll();
    }
  }, [handleCustomRoll]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 997,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 320,
        maxHeight: 'calc(100vh - 100px)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 998,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.bg,
        }}>
          <span style={{ fontSize: 18 }}>🎲</span>
          <span style={{ flex: 1, color: colors.gold, fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif' }}>
            Dice Roller
          </span>
          <button
            onClick={() => setHistory([])}
            style={{
              background: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              color: colors.textDim,
              fontSize: 11,
              cursor: 'pointer',
              padding: '3px 8px',
            }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 18, cursor: 'pointer', padding: '2px 4px' }}
          >
            ✕
          </button>
        </div>

        {/* Quick dice buttons */}
        <div style={{
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {STANDARD_DICE.map(sides => (
            <button
              key={sides}
              onClick={() => handleQuickRoll(sides)}
              style={{
                flex: '1 0 auto',
                minWidth: 38,
                padding: '6px 4px',
                backgroundColor: colors.surfaceHigh,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                color: colors.gold,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = colors.gold)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = colors.border)}
            >
              d{sides}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={customInput}
              onChange={e => { setCustomInput(e.target.value); setParseError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="2d6+3, 4d6, d20-1…"
              style={{
                flex: 1,
                backgroundColor: colors.bg,
                color: colors.text,
                border: `1px solid ${parseError ? colors.red : colors.border}`,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleCustomRoll}
              disabled={!customInput.trim()}
              style={{
                backgroundColor: colors.gold,
                color: colors.bg,
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: 13,
                cursor: customInput.trim() ? 'pointer' : 'default',
                opacity: customInput.trim() ? 1 : 0.5,
              }}
            >
              Roll
            </button>
          </div>
          {parseError && (
            <div style={{ color: colors.red, fontSize: 11, marginTop: 4 }}>{parseError}</div>
          )}
        </div>

        {/* Roll history */}
        <div
          ref={historyRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 16px',
            minHeight: 80,
            maxHeight: 280,
          }}
        >
          {history.length === 0 ? (
            <div style={{ color: colors.textDim, fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              Click a die or type a roll notation
            </div>
          ) : (
            history.map(roll => (
              <div
                key={roll.id}
                style={{
                  padding: '6px 0',
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                {/* Notation */}
                <span style={{ color: colors.textMuted, fontSize: 12, minWidth: 56 }}>
                  {roll.notation}
                </span>

                {/* Individual rolls */}
                <span style={{ flex: 1, fontSize: 12, color: colors.textDim }}>
                  {roll.rolls.length > 1 && (
                    <>
                      [{roll.rolls.map((r, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          <span style={{
                            color: isNatCrit(r, roll.rolls.length === 1 ? parseInt(roll.notation.match(/d(\d+)/)?.[1] ?? '0') : 0)
                              ? colors.gold
                              : colors.textDim,
                          }}>
                            {r}
                          </span>
                        </span>
                      ))}]
                      {roll.modifier !== 0 && (
                        <span style={{ color: colors.textMuted }}>
                          {roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}
                        </span>
                      )}
                    </>
                  )}
                  {roll.rolls.length === 1 && roll.modifier !== 0 && (
                    <span style={{ color: colors.textMuted }}>
                      {roll.rolls[0]}{roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}
                    </span>
                  )}
                </span>

                {/* Total */}
                <span style={{
                  color: isNat20(roll) ? '#4caf7d' : isNat1(roll) ? colors.red : colors.gold,
                  fontWeight: 700,
                  fontSize: 16,
                  minWidth: 28,
                  textAlign: 'right',
                }}>
                  {roll.total}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// Highlight helpers
function isNat20(roll: RollResult): boolean {
  return roll.rolls.length === 1 && roll.notation.includes('d20') && roll.rolls[0] === 20;
}

function isNat1(roll: RollResult): boolean {
  return roll.rolls.length === 1 && roll.notation.includes('d20') && roll.rolls[0] === 1;
}

function isNatCrit(_value: number, _sides: number): boolean {
  // Only highlight in the total, not individual dice in multi-roll
  return false;
}
