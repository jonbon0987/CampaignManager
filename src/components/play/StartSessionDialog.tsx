// Start session: which session is being played, and whether to record it.
// Recording's own step (microphone, player consent, Discord) follows when asked.

import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { usePlay } from '../../context/PlayContext';
import { useRecording } from '../../context/RecordingContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { formatSessionDate, nextSessionNumber, prepProgress, sessionName } from '../../lib/sessionLifecycle';
import { autoChronicleKey } from '../../lib/recording/autoChronicle';

const NEW = 'new';

/** Mount it while the dialog is open, so it starts from the sessions as they are then. */
export function StartSessionDialog() {
  const { sessions, selectedCampaignId } = useCampaign();
  const { closeStart, start } = usePlay();
  const { live: recordingLive } = useRecording();
  const planned = sessions.filter(s => s.status === 'planned').sort((a, b) => a.session_number - b.session_number);
  const [choice, setChoice] = useState<string>(() => planned[0]?.id ?? NEW);
  const [record, setRecord] = useLocalStorage(`dnd-record-on-start:${selectedCampaignId ?? ''}`, false);
  // Read by the recorder when the recording starts (lib/recording/autoChronicle).
  const [autoChronicle, setAutoChronicle] = useLocalStorage(autoChronicleKey(selectedCampaignId), true);
  const [starting, setStarting] = useState(false);

  const picked = planned.find(s => s.id === choice) ?? null;
  const number = picked?.session_number ?? nextSessionNumber(sessions);
  const canRecord = !recordingLive;

  const begin = async () => {
    setStarting(true);
    try {
      await start({ sessionId: picked?.id ?? null, record: record && canRecord });
    } catch {
      // The failed save has shown its toast; the dialog stays open to try again.
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={closeStart}
      title="Start a session"
      footer={
        <>
          <Button variant="secondary" onClick={closeStart}>Cancel</Button>
          <Button variant="primary" onClick={() => void begin()} disabled={starting}>
            {starting ? 'Starting…' : `▶ Start Session ${number}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="ssd-choices">
          <legend className="as-ll">Which session</legend>
          {planned.map(s => {
            const { done, total } = prepProgress(s);
            return (
              <label key={s.id} className={`ssd-choice${choice === s.id ? ' is-on' : ''}`}>
                <input type="radio" name="ssd-session" checked={choice === s.id} onChange={() => setChoice(s.id)} />
                <span className="ssd-choice-name">{sessionName(s)}</span>
                <span className="ssd-choice-meta">
                  {[s.session_date ? formatSessionDate(s.session_date) : null, `prep ${done} of ${total}`].filter(Boolean).join(' · ')}
                </span>
              </label>
            );
          })}
          <label className={`ssd-choice${choice === NEW ? ' is-on' : ''}`}>
            <input type="radio" name="ssd-session" checked={choice === NEW} onChange={() => setChoice(NEW)} />
            <span className="ssd-choice-name">A new session</span>
            <span className="ssd-choice-meta">Session {nextSessionNumber(sessions)}, unplanned</span>
          </label>
        </fieldset>

        <label className="ssd-record">
          <input type="checkbox" checked={record && canRecord} disabled={!canRecord} onChange={e => setRecord(e.target.checked)} />
          <span>
            <span className="ssd-choice-name">Record the session</span>
            <span className="ssd-choice-meta">
              {canRecord
                ? 'Next you pick the microphone and confirm who agreed to be recorded.'
                : 'Another recording is running. End it to record this session.'}
            </span>
          </span>
        </label>
        {record && canRecord && (
          <label className="ssd-record ssd-sub">
            <input type="checkbox" checked={autoChronicle} onChange={e => setAutoChronicle(e.target.checked)} />
            <span>
              <span className="ssd-choice-name">Write the chronicle when it ends</span>
              <span className="ssd-choice-meta">It’s transcribed and written up for you; the changes wait on Home for your review.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
