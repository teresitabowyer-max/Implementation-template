import { json, currentUser } from './_lib/http.js';
import { isLocal } from './_lib/db.js';
import { mailConfigured } from './_lib/mail.js';

export default function handler(req, res) {
  const user = currentUser(req);
  json(res, 200, {
    user,
    config: { local: isLocal, mail: mailConfigured || isLocal, notion: !!process.env.NOTION_TOKEN || isLocal },
  });
}
