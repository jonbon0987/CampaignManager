// Features that are built but not switched on yet.

/**
 * Posting a session's player recap to Discord. Off until the DM has checked
 * how recaps read on the player page. To try it locally, set
 * VITE_PLAYER_RECAP_DISCORD=true in .env.local and restart `npm run dev`.
 */
export const PLAYER_RECAP_DISCORD = import.meta.env.VITE_PLAYER_RECAP_DISCORD === 'true';
