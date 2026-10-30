// What a session left open, sent to the Threads Inbox as ideas to work into
// threads (each line its own idea). The next session's Prep shows the same
// list under "Last time".

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { leftOpenLines } from '../../lib/sessionLifecycle';
import { Button } from '../ui/Button';

export function LeftOpenToInbox({ text, sessionNumber }: { text: string | null; sessionNumber: number }) {
  const { ideas, upsertIdea } = useCampaign();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const lines = leftOpenLines(text);
  const already = new Set(ideas.map(i => i.text.trim()));
  const fresh = lines.filter(l => !already.has(l));

  if (lines.length === 0) return null;

  const send = async () => {
    setSending(true);
    try {
      for (const line of fresh) await upsertIdea({ text: line, tag: `left open · session ${sessionNumber}`, promoted_hook_id: null });
      toast(`${fresh.length} sent to the Inbox`, 'success');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="lo-inbox">
      <span className="lo-inbox-note">
        {fresh.length === 0 ? 'All in the Threads Inbox.' : `${fresh.length} of ${lines.length} not in the Threads Inbox yet.`}
      </span>
      {fresh.length > 0 && (
        <Button size="xs" variant="secondary" onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : `Send ${fresh.length === 1 ? 'it' : `all ${fresh.length}`} to the Inbox`}
        </Button>
      )}
    </div>
  );
}
