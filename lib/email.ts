type SendEmailResult = {
  ok: boolean;
  error?: string;
};

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type ConfirmationMode = "signup" | "resend";

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildConfirmationLink(token: string): string {
  return `${getAppUrl()}/confirm-email?token=${token}`;
}

async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  if (!from) {
    return { ok: false, error: "EMAIL_FROM is not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: body || `Resend request failed with status ${response.status}`,
    };
  }

  return { ok: true };
}

function buildVerificationHtml(params: {
  brand: string;
  previewText: string;
  heading: string;
  subheading: string;
  buttonLabel: string;
  notice: string;
  confirmationLink: string;
}): string {
  return `
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>${params.brand} 驗證信箱</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f5f4;color:#1c1917;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;">
        <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${params.previewText}</span>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 28px 10px;background:linear-gradient(135deg,#1f2937 0%,#0f172a 100%);">
                    <p style="margin:0;color:#d6d3d1;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Email Verification</p>
                    <h1 style="margin:10px 0 0;color:#ffffff;font-size:24px;line-height:1.3;">${params.heading}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 28px 8px;">
                    <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#292524;">${params.subheading}</p>
                    <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#57534e;">${params.notice}</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                      <tr>
                        <td align="center" style="border-radius:10px;background:#1f2937;">
                          <a href="${params.confirmationLink}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${params.buttonLabel}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 20px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#78716c;">按鈕無法點擊？請複製這個連結：</p>
                    <p style="margin:0;word-break:break-all;"><a href="${params.confirmationLink}" style="font-size:13px;color:#1d4ed8;text-decoration:underline;">${params.confirmationLink}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px 24px;border-top:1px solid #f0efee;">
                    <p style="margin:0;font-size:12px;line-height:1.7;color:#a8a29e;">如果這不是您的操作，請忽略本信件。</p>
                    <p style="margin:6px 0 0;font-size:12px;color:#a8a29e;">© ${new Date().getFullYear()} ${params.brand}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendConfirmationEmail(params: {
  to: string;
  token: string;
  mode?: ConfirmationMode;
}): Promise<SendEmailResult> {
  const confirmationLink = buildConfirmationLink(params.token);
  const mode = params.mode ?? "signup";
  const expiresIn = "24 小時";
  const brand = "心靈導師";
  const subject =
    mode === "resend"
      ? `${brand}｜重新寄送驗證信箱連結`
      : `${brand}｜請驗證您的帳戶信箱`;
  const heading = mode === "resend" ? "這是新的驗證連結" : `歡迎來到 ${brand}`;
  const subheading =
    mode === "resend"
      ? "我們已為您重新產生驗證連結，請點擊下方按鈕完成信箱驗證。"
      : "請點擊下方按鈕完成信箱驗證，啟用您的帳號。";
  const previewText =
    mode === "resend" ? "重新寄送的驗證連結已準備好" : "請驗證您的信箱以啟用帳號";
  const buttonLabel = mode === "resend" ? "重新驗證信箱" : "立即驗證信箱";

  return sendEmail({
    to: params.to,
    subject,
    text: `${brand}\n\n請開啟下方連結完成信箱驗證：\n${confirmationLink}\n\n此連結將在 ${expiresIn} 內有效。\n\n若這不是您的操作，請忽略此信件。`,
    html: buildVerificationHtml({
      brand,
      previewText,
      heading,
      subheading,
      buttonLabel,
      notice: `安全提醒：此驗證連結將在 ${expiresIn} 後失效。`,
      confirmationLink,
    }),
  });
}

export async function sendWelcomeEmail(params: { to: string }): Promise<SendEmailResult> {
  const brand = "心靈導師";
  const appUrl = getAppUrl();

  return sendEmail({
    to: params.to,
    subject: `${brand}｜信箱驗證完成，歡迎加入`,
    text: `${brand}\n\n您的信箱已驗證完成，現在可以開始使用服務。\n\n立即開始：${appUrl}\n\n祝您使用愉快。`,
    html: `
      <!doctype html>
      <html lang="zh-Hant">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="x-apple-disable-message-reformatting" />
          <title>${brand} 歡迎信</title>
        </head>
        <body style="margin:0;padding:0;background:#f7f7f7;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
                  <tr>
                    <td style="padding:28px;background:#ecfeff;">
                      <p style="margin:0;font-size:12px;color:#0e7490;letter-spacing:.1em;text-transform:uppercase;">Welcome</p>
                      <h2 style="margin:8px 0 0;font-size:24px;color:#0f172a;">驗證完成，歡迎加入 ${brand}</h2>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 28px;">
                      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#1f2937;">你的帳號已成功啟用，現在可以開始使用所有功能。</p>
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="border-radius:10px;background:#0f172a;">
                            <a href="${appUrl}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">前往開始使用</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
}
