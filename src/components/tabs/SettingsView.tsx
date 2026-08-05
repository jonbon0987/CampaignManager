import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { signOut } from '../../lib/auth';
import { Button } from '../ui/Button';

function SettingRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="set-label">{label}</div>
        <div className="set-help">{help}</div>
      </div>
      {children}
    </div>
  );
}

function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`cm-pill ${active ? 'is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function SettingsView() {
  const { selectedCampaign } = useCampaign();
  const [autoApply, setAutoApply] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [hideAiInSession, setHideAiInSession] = useState(true);

  return (
    <div className="cm-md cm-md-single">
      <div className="cm-md-detail">
        <div className="cm-detail">
          <div className="cm-detail-head">
            <div className="cm-detail-eyebrow">Settings</div>
            <h1 className="cm-detail-title">Campaign Settings</h1>
          </div>
          <div className="cm-detail-body">
            {/* Campaign info */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Campaign</span>
                <span className="cm-section-rule" />
              </div>
              {selectedCampaign && (
                <div style={{ padding: '8px 0', color: 'var(--ink-2)', fontSize: '14px' }}>
                  <strong>{selectedCampaign.name}</strong>
                </div>
              )}
            </section>

            {/* AI assistant settings */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Campaign Assistant</span>
                <span className="cm-section-rule" />
              </div>

              <SettingRow
                label="Auto-apply small edits"
                help="If the assistant proposes a tiny change (single field), apply it without going through the inbox."
              >
                <TogglePill active={autoApply} onClick={() => setAutoApply(!autoApply)}>
                  {autoApply ? 'On' : 'Off'}
                </TogglePill>
              </SettingRow>

              <SettingRow
                label='Show "context" pills'
                help="Display what the assistant is currently looking at, on top of the rail."
              >
                <TogglePill active={showContext} onClick={() => setShowContext(!showContext)}>
                  {showContext ? 'On' : 'Off'}
                </TogglePill>
              </SettingRow>
            </section>

            {/* Run session settings */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Run Session</span>
                <span className="cm-section-rule" />
              </div>

              <SettingRow
                label="Hide assistant during sessions"
                help="Recommended -- the rail collapses while you're running a game."
              >
                <TogglePill active={hideAiInSession} onClick={() => setHideAiInSession(!hideAiInSession)}>
                  {hideAiInSession ? 'On' : 'Off'}
                </TogglePill>
              </SettingRow>
            </section>

            {/* Account */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Account</span>
                <span className="cm-section-rule" />
              </div>
              <div style={{ paddingTop: '8px' }}>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={signOut}
                  style={{ color: 'var(--red)' }}
                >
                  Sign out
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
