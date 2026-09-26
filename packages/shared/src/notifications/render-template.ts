import type { NotificationTemplate } from '../schemas/notification-template';

/**
 * [ABE-25] Pure — no Firestore, safe to call from a preview route, a
 * future actual-send path, or a test. Only substitutes `{{name}}` when
 * `name` is in `template.variables` (the whitelist) AND a value for it
 * was actually given; anything else (an unlisted placeholder, a listed
 * one with no value supplied) is left as literal text rather than
 * silently rendered blank — so a preview or a real send never hides a
 * misconfigured template behind an empty string.
 */
export function renderNotificationTemplate(
  template: Pick<NotificationTemplate, 'subject' | 'body' | 'variables'>,
  values: Record<string, string>
): { subject: string; body: string } {
  const allowed = new Set(template.variables);
  const substitute = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      if (!allowed.has(name) || !Object.prototype.hasOwnProperty.call(values, name)) {
        return match;
      }
      return values[name];
    });
  return { subject: substitute(template.subject), body: substitute(template.body) };
}
