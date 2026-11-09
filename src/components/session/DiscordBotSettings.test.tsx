import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DiscordBot } from '../../hooks/useDiscordBot';

const h = vi.hoisted(() => ({ bot: null as unknown, toast: vi.fn() }));
vi.mock('../../hooks/useDiscordBot', () => ({ useDiscordBot: () => h.bot }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => h.toast }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: () => Promise.resolve({ id: 'user-1' }) }));

import { DiscordBotSettings } from './DiscordBotSettings';

const tavern = { guildId: 'g1', channelId: 'c1', channelName: 'Tavern' };
const guilds = [{ id: 'g1', name: 'The Table', voice: [{ id: 'c1', name: 'Tavern', members: [] }, { id: 'c2', name: 'Dungeon', members: [] }], text: [] }];

function show(over: Partial<DiscordBot>) {
  const setControl = vi.fn().mockResolvedValue(undefined);
  h.bot = {
    presence: { id: 'p', user_id: 'u', bot_tag: 'Lair#1', heartbeat_at: '', guilds, created_at: '', updated_at: '', voice: null, detail: null },
    control: { online: false, voice: null }, loaded: true, refresh: vi.fn(), setControl,
    status: 'offline', running: true, online: false, ...over,
  };
  render(<DiscordBotSettings />);
  return setControl;
}

beforeEach(() => vi.clearAllMocks());

describe('DiscordBotSettings', () => {
  it('signs a running bot in', () => {
    const setControl = show({});
    expect(screen.getByText('Signed out')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(setControl).toHaveBeenCalledWith({ online: true });
  });

  it('signs an online bot out, and seats it in the voice channel picked', () => {
    const setControl = show({ status: 'online', online: true, control: { online: true, voice: null } });
    fireEvent.change(screen.getByLabelText('Voice channel to join'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(setControl).toHaveBeenCalledWith({ voice: tavern });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(setControl).toHaveBeenCalledWith({ online: false });
  });

  it('shows where it’s sitting, and takes it out', () => {
    const setControl = show({
      status: 'online', online: true, control: { online: true, voice: tavern },
      presence: { id: 'p', user_id: 'u', bot_tag: 'Lair#1', heartbeat_at: '', guilds, created_at: '', updated_at: '', voice: tavern, detail: null },
    });
    expect(screen.getByText('In The Table · #Tavern')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(setControl).toHaveBeenCalledWith({ voice: null });
  });

  it('says it’s signing in once asked, before the bot catches up', () => {
    show({ control: { online: true, voice: null } });
    expect(screen.getAllByText('Signing in…').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('shows why it couldn’t sign in, with a way to try again', () => {
    const setControl = show({
      status: 'error',
      presence: { id: 'p', user_id: 'u', bot_tag: null, heartbeat_at: '', guilds: [], created_at: '', updated_at: '', detail: 'Couldn’t sign in to Discord: An invalid token was provided.' },
    });
    expect(screen.getByRole('status').textContent).toMatch(/invalid token/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(setControl).toHaveBeenCalledWith({ online: true });
  });

  it('explains how to set it up when nothing’s running, with no controls', () => {
    show({ status: 'not-running', running: false });
    expect(screen.getAllByText('npm run bot:install').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Copy the install command' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });
});
