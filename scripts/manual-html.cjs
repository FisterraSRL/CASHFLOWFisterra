'use strict';

const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function renderManualMarkdown(markdown){
  const html=[],toc=[];let paragraph=[],list=null,section=0;
  const inline=value=>escapeHtml(value).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>').replace(/https:\/\/[^\s<]+/g,url=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  const flushParagraph=()=>{if(paragraph.length){html.push(`<p>${inline(paragraph.join(' '))}</p>`);paragraph=[]}};
  const closeList=()=>{if(list){html.push(`</${list}>`);list=null}};
  for(const line of markdown.split(/\r?\n/)){
    const text=line.trim();
    if(!text){flushParagraph();closeList();continue}
    const heading=text.match(/^(#{1,3})\s+(.+)$/);
    if(heading){flushParagraph();closeList();const level=heading[1].length;
      if(level===2){section++;toc.push(`<a href="#manual-section-${section}" data-manual-target="manual-section-${section}">${inline(heading[2])}</a>`)}
      html.push(`<h${level}${level===2?` id="manual-section-${section}"`:''}>${inline(heading[2])}</h${level}>`);continue}
    const bullet=text.match(/^[-*]\s+(.+)$/),numbered=text.match(/^\d+\.\s+(.+)$/);
    if(bullet||numbered){flushParagraph();const next=bullet?'ul':'ol';if(list!==next){closeList();html.push(`<${next}>`);list=next}html.push(`<li>${inline((bullet||numbered)[1])}</li>`);continue}
    closeList();paragraph.push(text);
  }
  flushParagraph();closeList();
  return {html:html.join('\n'),toc:toc.join('\n')};
}

module.exports={renderManualMarkdown};
