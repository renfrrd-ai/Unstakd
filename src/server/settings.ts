import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";

export type SettingKey = "alerts.discordWebhook" | "alerts.webhook";

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db().select().from(s.settings).where(eq(s.settings.key, key));
  return row ? decrypt(row.valueEnc) : null;
}

export async function setSetting(key: SettingKey, value: string | null) {
  if (!value) {
    await db().delete(s.settings).where(eq(s.settings.key, key));
    return;
  }
  await db()
    .insert(s.settings)
    .values({ key, valueEnc: encrypt(value) })
    .onConflictDoUpdate({ target: s.settings.key, set: { valueEnc: encrypt(value), updatedAt: new Date() } });
}
