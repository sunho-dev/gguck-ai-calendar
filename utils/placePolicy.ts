import type { InterpretedEvent, KnownPlaceAlias } from '../api/_interpretCore';
import { commonMeaning, explicitActivity, categories } from './scheduler';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = (s: string) =>
  new RegExp('(^|\\s)' + escape(s) + '(?=$|\\s|에서|으로|에(?:\\s|$)|로(?:\\s|$))');
export function applyPlacePolicy(
  text: string,
  event: InterpretedEvent,
  aliases: KnownPlaceAlias[],
): InterpretedEvent {
  const known = [...aliases]
    .sort((a, b) => b.alias.length - a.alias.length)
    .find((a) => pattern(a.alias).test(text));
  const common = commonMeaning(text);
  if (known) {
    const action = explicitActivity(text.replace(pattern(known.alias), ' '));
    return {
      ...event,
      place: { name: known.name, address: known.address },
      placeAliasCandidate: null,
      category: action ? categories[action] : known.category || event.category,
      ambiguousFields: event.ambiguousFields.filter((f) => f !== 'place' && f !== 'category'),
    };
  }
  // Only override the identified general place itself, not another unknown place in the same sentence.
  if (
    common.location &&
    (!event.placeAliasCandidate || event.placeAliasCandidate === common.location) &&
    (!event.place || event.place.name === common.location)
  ) {
    return {
      ...event,
      place: { name: common.location, address: null },
      placeAliasCandidate: null,
      category: common.category ? categories[common.category] : event.category,
      ambiguousFields: event.ambiguousFields.filter((f) => f !== 'place' && f !== 'category'),
    };
  }
  return event;
}
