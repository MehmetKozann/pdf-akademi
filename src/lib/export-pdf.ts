export function exportHtmlAsPdf(params: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
}) {
  const printWindow = window.open("", "_blank", "width=920,height=780");
  if (!printWindow) {
    window.print();
    return;
  }

  const dateStr = new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    @page { margin: 20mm 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #14213d;
      line-height: 1.65;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    .doc-header {
      border-bottom: 2px solid #14213d;
      padding-bottom: 12px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .brand {
      font-size: 10pt;
      font-weight: 700;
      color: #ff6b5b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    h1 { font-size: 18pt; margin: 6px 0 4px 0; color: #14213d; }
    h2 { font-size: 14pt; color: #14213d; border-bottom: 1px solid #e5dccb; padding-bottom: 4px; margin-top: 20px; }
    h3 { font-size: 12pt; color: #14213d; margin-top: 14px; }
    .meta { font-size: 9.5pt; color: #64748b; }
    blockquote {
      border-left: 3px solid #ff6b5b;
      background: #f4ede0;
      margin: 12px 0;
      padding: 10px 14px;
      border-radius: 0 6px 6px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
    }
    th { background: #f1f5f9; font-weight: 600; }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="brand">AkademikAI — Akıllı Öğrenme Platformu</div>
      <h1>${escapeHtml(params.title)}</h1>
      ${params.subtitle ? `<div class="meta">${escapeHtml(params.subtitle)}</div>` : ""}
    </div>
    <div class="meta">${dateStr}</div>
  </div>
  <div class="content">
    ${params.bodyHtml}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

