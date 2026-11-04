import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { makeCampaignContext, makeConfirm } from '../../test/contextMocks';
import { makeFaction, makeNPC, makePC } from '../../test/fixtures';

const h = vi.hoisted(() => ({ campaign: { value: null as Record<string, unknown> | null }, confirm: vi.fn(), openRecord: vi.fn(), report: vi.fn() }));
vi.mock('../../context/CampaignContext', () => ({ useCampaign: () => h.campaign.value }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => h.confirm }));
vi.mock('../../context/NavigationContext', () => ({ useOpenRecord: () => h.openRecord, useReportRecord: (_tab: string, id: string | null) => h.report(id) }));

import CharacterWeb from './CharacterWeb';

function show(over = {}, props = {}) {
  const upsertRelationship = vi.fn().mockResolvedValue(undefined);
  h.campaign.value = makeCampaignContext({
    pcs: [makePC({ id: 'p1', character_name: 'Test Hero' })],
    npcs: [makeNPC({ id: 'n1', name: 'Sable Thorne', met_by_pcs: true, faction_ids: ['f1'] }), makeNPC({ id: 'n2', name: 'Brenna Coldwater', met_by_pcs: true })],
    factions: [makeFaction({ id: 'f1', name: 'The Grey Hand', key_figure_ids: ['n2'] })],
    relationships: [], upsertRelationship, ...over,
  });
  render(<CharacterWeb {...props} />);
  return { upsertRelationship };
}
const node = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const side = () => within(document.querySelector('.cw-side') as HTMLElement);

beforeEach(() => { vi.clearAllMocks(); h.confirm = makeConfirm(true); });

describe('the relationship web', () => {
  it('shows factions as nodes, in their own shape', () => {
    show();
    expect(node('The Grey Hand').querySelector('polygon')).toBeTruthy();
    expect(node('Sable Thorne').querySelector('circle')).toBeTruthy();
    expect(screen.getByText('FACTIONS')).toBeTruthy();
  });

  it('leaves out the factions ring when there are none', () => {
    show({ factions: [] });
    expect(screen.queryByText('FACTIONS')).toBeNull();
  });

  it('says what to do when nothing is connected yet, and starts from there', () => {
    show();
    expect(side().getByText('No relationships yet')).toBeTruthy();
    fireEvent.click(side().getByRole('button', { name: 'Add the first relationship' }));
    expect(screen.getAllByRole('option', { name: 'The Grey Hand (Faction)', hidden: true })).toHaveLength(2);
  });

  it('lets a faction hold a relationship', async () => {
    const { upsertRelationship } = show();
    fireEvent.click(node('The Grey Hand'));
    fireEvent.click(side().getByRole('button', { name: '+ Add relationship' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Relationship' }).at(-1)!);
    await waitFor(() => expect(upsertRelationship).toHaveBeenCalledWith(expect.objectContaining({ from_id: 'f1', from_kind: 'faction' })));
  });

  it('draws who belongs to what, from both sides, and lists them on focus', () => {
    show();
    expect(document.querySelectorAll('.cw-member')).toHaveLength(2);
    fireEvent.click(node('The Grey Hand'));
    expect(side().getByText('Members (2)')).toBeTruthy();
    fireEvent.click(side().getByRole('button', { name: 'Sable Thorne' }));
    expect(side().getByText('Belongs to (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    expect(document.querySelectorAll('.cw-member')).toHaveLength(0);
  });

  it('focuses a record asked for from outside, and reports it for the URL', async () => {
    const onOpenConsumed = vi.fn();
    show({}, { openId: 'n1', onOpenConsumed });
    await waitFor(() => expect(side().getByRole('heading', { name: 'Sable Thorne' })).toBeTruthy());
    expect(node('Sable Thorne').getAttribute('aria-pressed')).toBe('true');
    expect(onOpenConsumed).toHaveBeenCalled();
    expect(h.report).toHaveBeenLastCalledWith('n1');
  });

  it('opens the focused record’s page', () => {
    show();
    fireEvent.click(node('Sable Thorne'));
    fireEvent.click(side().getByRole('button', { name: 'Open their page' }));
    expect(h.openRecord).toHaveBeenCalledWith('cast', 'n1');
  });

  it('can be worked from the keyboard', () => {
    show();
    fireEvent.keyDown(node('Test Hero'), { key: 'Enter' });
    expect(side().getByRole('heading', { name: 'Test Hero' })).toBeTruthy();
  });
});
