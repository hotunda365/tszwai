type SendEmailResult = {
  ok: boolean;
  error?: string;
};

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildConfirmationLink(token: string): string {
  return `${getAppUrl()}/confirm-email?token=${token}`;
}

export async function sendConfirmationEmail(params: {
  to: string;
  token: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not configured" };
  }

  const confirmationLink = buildConfirmationLink(params.token);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "請驗證您的帳戶信箱",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
          <h2 style="margin-bottom: 12px;">歡迎使用心靈導師</h2>
          <p>請點擊下方按鈕完成信箱驗證，此連結將在 24 小時後失效。</p>
          <p style="margin: 24px 0;">
            <a href="${confirmationLink}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #1f2937; color: #ffffff; text-decoration: none;">驗證信箱</a>
          </p>
          <p>若按鈕無法點擊，請直接複製以下連結：</p>
          <p><a href="${confirmationLink}">${confirmationLink}</a></p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">若這不是您的操作，請忽略此信件。</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    return {
      ok: false,
      error: payload || `Resend request failed with status ${response.status}`,
    };
  }

  return { ok: true };
}
