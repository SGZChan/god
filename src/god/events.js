// World event bus. Every god power and every natural disaster pushes an event here, so that the
// (upcoming) religion system can let mortals interpret them. Mortals do not know about the player.
//
// Event contract:
//   { id, kind: 'blessing'|'curse'|'disaster'|'miracle'|'omen', name, x, y, radius,
//     time (ecosystem.timeYears), source: 'god'|'nature', magnitude (0..1+) }
export const MAX_WORLD_EVENTS = 200;
export const EVENT_KINDS = ['blessing', 'curse', 'disaster', 'miracle', 'omen'];

export function pushWorldEvent(ecosystem, { kind, name, x, y, radius = 3, source = 'god', magnitude = 0.5 }) {
  if (!ecosystem) return null;
  if (!Array.isArray(ecosystem.worldEvents)) ecosystem.worldEvents = [];
  ecosystem.worldEventSeq = (ecosystem.worldEventSeq || 0) + 1;
  const event = {
    id: `ev_${ecosystem.worldEventSeq}`,
    kind,
    name,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    radius,
    time: ecosystem.timeYears || 0,
    source,
    magnitude
  };
  ecosystem.worldEvents.push(event);
  if (ecosystem.worldEvents.length > MAX_WORLD_EVENTS) {
    ecosystem.worldEvents.splice(0, ecosystem.worldEvents.length - MAX_WORLD_EVENTS);
  }
  return event;
}
