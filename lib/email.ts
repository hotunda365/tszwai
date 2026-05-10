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
  const expiresIn = "24 小時";
  const brand = "心靈導師";
  const previewText = "請驗證您的信箱以啟用帳號";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `${brand}｜請驗證您的帳戶信箱`,
      text: `${brand}\n\n請開啟下方連結完成信箱驗證：\n${confirmationLink}\n\n此連結將在 ${expiresIn} 內有效。\n\n若這不是您的操作，請忽略此信件。`,
      html: `
        <!doctype html>
        <html lang="zh-Hant">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="x-apple-disable-message-reformatting" />
            <title>${brand} 驗證信箱</title>
          </head>
          <body style="margin:0;padding:0;background:#f5f5f4;color:#1c1917;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;">
            <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${previewText}</span>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:24px 12px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
                    <tr>
                      <td style="padding:28px 28px 10px;background:linear-gradient(135deg,#1f2937 0%,#0f172a 100%);">
                        <p style="margin:0;color:#d6d3d1;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Email Verification</p>
                        <h1 style="margin:10px 0 0;color:#ffffff;font-size:24px;line-height:1.3;">歡迎來到 ${brand}</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px 28px 8px;">
                        <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#292524;">請點擊下方按鈕完成信箱驗證，啟用您的帳號。</p>
                        <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#57534e;">安全提醒：此驗證連結將在 <strong>${expiresIn}</strong> 後失效。</p>
                        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                          <tr>
                            <td align="center" style="border-radius:10px;background:#1f2937;">
                              <a href="${confirmationLink}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">立即驗證信箱</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 28px 20px;">
                        <p style="margin:0 0 8px;font-size:13px;color:#78716c;">按鈕無法點擊？請複製這個連結：</p>
                        <p style="margin:0;word-break:break-all;"><a href="${confirmationLink}" style="font-size:13px;color:#1d4ed8;text-decoration:underline;">${confirmationLink}</a></p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 28px 24px;border-top:1px solid #f0efee;">
                        <p style="margin:0;font-size:12px;line-height:1.7;color:#a8a29e;">如果這不是您的操作，請忽略本信件。</p>
                        <p style="margin:6px 0 0;font-size:12px;color:#a8a29e;">© ${new Date().getFullYear()} ${brand}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
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
