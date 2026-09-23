// A deliberately small markdown renderer for diary previews: headings, bullet
// lists, paragraphs, links, inline code, bold and italics. It builds React
// elements (never raw HTML), so diary content can't inject markup.

const INLINE = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(_([^_]+)_)/g;

function renderInline(text, keyPrefix) {
  const out = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1]) {
      out.push(
        <a key={key} href={match[3]} target="_blank" rel="noreferrer">
          {renderInline(match[2], key)}
        </a>
      );
    } else if (match[4]) {
      out.push(<code key={key}>{match[5]}</code>);
    } else if (match[6]) {
      out.push(<strong key={key}>{renderInline(match[7], key)}</strong>);
    } else if (match[8]) {
      out.push(<em key={key}>{renderInline(match[9], key)}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ source }) {
  const blocks = [];
  let list = null;
  let paragraph = null;

  const flush = () => {
    if (list) blocks.push(<ul key={`b${blocks.length}`}>{list}</ul>);
    if (paragraph) blocks.push(<p key={`b${blocks.length}`}>{renderInline(paragraph.join(" "), `p${blocks.length}`)}</p>);
    list = null;
    paragraph = null;
  };

  source.split("\n").forEach((raw, lineNo) => {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);

    if (heading) {
      flush();
      const Tag = `h${Math.min(heading[1].length + 2, 6)}`;
      blocks.push(<Tag key={`b${blocks.length}`}>{renderInline(heading[2], `h${lineNo}`)}</Tag>);
    } else if (item) {
      if (paragraph) flush();
      list = list || [];
      list.push(<li key={lineNo}>{renderInline(item[1], `li${lineNo}`)}</li>);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      paragraph = paragraph || [];
      paragraph.push(line.trim());
    }
  });
  flush();

  return <div className="markdown">{blocks}</div>;
}
