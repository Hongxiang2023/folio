// Markers are deliberately explicit, except for the established parenthesized PMID syntax.
export function normalizeCitationIdentifier(type, input) {
  const value = String(input ?? '').trim();
  type = String(type).toLowerCase();
  if (type === 'pmid' && /^[1-9]\d{0,8}$/.test(value)) return value;
  if (type === 'doi') {
    const doi = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    if (/^10\.\d{4,9}\/[^\s<>]+$/i.test(doi)) return doi.toLowerCase();
  }
  if (type === 'arxiv') {
    const id = value.replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '').replace(/^arxiv:\s*/i, '').replace(/\.pdf$/i, '');
    if (/^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]*\/\d{7})(?:v[1-9]\d*)?$/i.test(id)) return id.replace(/v\d+$/i, '').toLowerCase();
  }
  if (type === 'folio' && /^[a-z0-9][a-z0-9._:-]*$/i.test(value)) return value;
  return null;
}
export function parseCitationMarkers(text) {
  const markers = [];
  // Balanced parentheses inside DOI suffixes are supported (common for older publishers).
  const pattern = /\((?:[^()\r\n]|\([^()\r\n]*\))*\)|\[[^\[\]\r\n]+\]/g;
  for (const match of text.matchAll(pattern)) {
    const body = match[0].slice(1, -1), square = match[0][0] === '[';
    const parts = body.split(/;\s*|,\s*(?=(?:PMID|doi|arxiv|folio)\s*:|\d+(?:\s*[,;]|\s*$))/i).map(s => s.trim());
    const pmidGroup = /^PMID\s*:/i.test(parts[0]);
    const identifiers = [];
    for (const part of parts) {
      const explicit = /^(PMID|doi|arxiv|folio)\s*:\s*(.+)$/i.exec(part);
      const type = explicit ? explicit[1].toLowerCase() : 'pmid';
      if (!explicit && (square || !(pmidGroup ? /^[1-9]\d{0,8}$/ : /^[1-9]\d{6,8}$/).test(part))) break;
      const value = normalizeCitationIdentifier(type, explicit ? explicit[2] : part);
      if (!value) break;
      identifiers.push({ type, value, key: `${type}:${value}` });
    }
    if (identifiers.length !== parts.length) continue;
    markers.push({ start: match.index, end: match.index + match[0].length, original: match[0], identifiers: [...new Map(identifiers.map(id => [id.key,id])).values()] });
  }
  return markers;
}
export function paperCitationIdentifiers(paper) {
  const values = { folio: paper.id, pmid: paper.pmid, doi: paper.doi, arxiv: paper.arxivId || paper.arxiv || (/arxiv\.org\//i.test(paper.sourceUrl || '') ? paper.sourceUrl : '') };
  return Object.entries(values).flatMap(([type, input]) => {
    const value = normalizeCitationIdentifier(type, input);
    return value ? [{type,value,key:`${type}:${value}`}] : [];
  });
}

export function resolveCitationMarkers(text, papers) {
  const warnings = new Set(), byAlias = new Map(), records = [];
  for (const paper of papers) {
    const identifiers = paperCitationIdentifiers(paper);
    if (!identifiers.length) continue;
    const candidates = [...new Set(identifiers.flatMap(id => byAlias.get(id.key) || []))];
    // Do not merge distinct PubMed records just because imported metadata repeats a DOI.
    const compatible = record => ['pmid','doi','arxiv','folio'].every(type => {
      if (type === 'folio') return true; // Duplicate imports may have different local IDs.
      const incoming = identifiers.find(id => id.type === type);
      return !incoming || !record.identifiers.some(id => id.type === type && id.value !== incoming.value);
    });
    let record = candidates.find(compatible);
    if (!record) {
      const pmid = identifiers.find(id => id.type === 'pmid');
      record = { id: pmid?.value || identifiers[0].key, paper, identifiers: [] };
      // CSL IDs must remain unique even in the presence of conflicting library metadata.
      if (records.some(r => r.id === record.id)) record.id += `:record-${records.length}`;
      records.push(record);
    } else {
      warnings.add('Duplicate library records refer to the same citation; the first record was used.');
      // A fuller import can connect two earlier records (e.g. DOI-only and PMID-only).
      for (const other of candidates) {
        if (other === record || !compatible(other)) continue;
        const conflict = other.identifiers.some(id => id.type !== 'folio' && record.identifiers.some(known => known.type === id.type && known.value !== id.value));
        if (conflict) continue;
        for (const id of other.identifiers) {
          if (!record.identifiers.some(known => known.key === id.key)) record.identifiers.push(id);
          byAlias.set(id.key, [...new Set((byAlias.get(id.key) || []).map(r => r === other ? record : r))]);
        }
        records.splice(records.indexOf(other), 1);
      }
    }
    for (const id of identifiers) {
      if (!record.identifiers.some(known => known.key === id.key)) record.identifiers.push(id);
      const list = byAlias.get(id.key) || [];
      if (!list.includes(record)) list.push(record);
      byAlias.set(id.key, list);
    }
  }
  const unresolved = new Set(), markers = [];
  for (const marker of parseCitationMarkers(text)) {
    const matches = marker.identifiers.map(id => {
      const records = byAlias.get(id.key) || [];
      if (records.length > 1) {
        warnings.add(`Identifier ${id.key} matches conflicting library records; its marker was left unchanged. Resolve the duplicate metadata and generate again.`);
        return null;
      }
      return records[0];
    });
    if (matches.some(record => !record)) {
      marker.identifiers.forEach((id,i) => { if (!matches[i]) unresolved.add(id.type === 'pmid' ? id.value : id.key); });
      continue;
    }
    const unique = [...new Map(matches.map(record => [record.id,record])).values()];
    markers.push({...marker, pmids: unique.map(r => r.id), paperIds: unique.map(r => r.paper.id).filter(Boolean)});
  }
  if (unresolved.size) warnings.add('Markers containing unknown or ambiguous identifiers were left unchanged. Add the papers to the library or resolve conflicting metadata and generate again.');
  return { markers, records: new Map(records.map(r => [r.id,r.paper])), unresolved: [...unresolved], warnings: [...warnings] };
}
