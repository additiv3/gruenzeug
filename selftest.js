/* GRUENZEUG – Selbsttest im Browser. Aufruf: http://localhost:8140/index.html?selftest
   Sichert deine Daten (als Sicherungsdatei im Speicher), löscht alles, prüft Daten, Sicherung, Pflege-Rechnung,
   PIN und alle Seiten, und stellt danach deine Daten wieder her. Ergebnis: window.gruenTest {fails, errors, ok}
   und ein Kasten auf der Seite. Neue Funktionen → hier ergänzen. */
(async function selftest() {
  const { App, Data, Gruen, Einst, Sicherung, Pflege, Privat, U, Zip } = window.gruen;
  const t = { ok: 0, fails: [], errors: [] };
  const pruefe = (b, msg) => { if (b) t.ok++; else t.fails.push(msg); };
  const gleich = (a, b, msg) => pruefe(JSON.stringify(a) === JSON.stringify(b), msg + ' – erwartet ' + JSON.stringify(b) + ', war ' + JSON.stringify(a));
  const schritt = async (name, fn) => { try { await fn(); } catch (e) { t.errors.push(name + ': ' + (e && e.stack || e)); } };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const bildDatei = (farbe) => new Promise((res) => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = farbe; x.fillRect(0, 0, 320, 240); c.toBlob((b) => res(new File([b], 'x.png', { type: 'image/png' })), 'image/png'); });
  const fehlerAlt = []; const onerr = (e) => fehlerAlt.push(e.message || String(e)); window.addEventListener('error', onerr);

  // Sicherung der echten Daten
  const meineEinst = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('gruen.')) meineEinst[k] = localStorage.getItem(k); }
  const meineDaten = await Sicherung.erstellen({});
  await Data.alleLoeschen(); Einst.del('pin'); Privat.offen = false;

  await schritt('util', async () => {
    gleich(U.zahl('1.234,5'), 1234.5, 'Zahl mit Tausenderpunkt');
    gleich(U.zahl('3,2'), 3.2, 'Zahl mit Komma');
    gleich(U.zahl(''), null, 'Leere Zahl');
    gleich(U.norm('Größe Ä'), 'groesse ae', 'Normalisieren');
    pruefe(U.trifft('Monstera deliciosa Fensterblatt', 'fenster monst'), 'Suche über mehrere Wörter');
    gleich(U.tageZwischen('2026-02-27', '2026-03-02'), 3, 'Tage über Monatsgrenze');
    gleich(U.plusTage('2026-12-30', 3), '2027-01-02', 'Tage über Jahresgrenze');
    gleich(U.alter('2026-01-01', '2026-03-05'), '2 Monate', 'Alter');
    gleich(U.rel(U.plusTage(U.heute(), 2)), 'in 2 Tagen', 'Relativ Zukunft');
    gleich(U.rel(U.plusTage(U.heute(), -90)), 'vor 3 Monaten', 'Relativ Vergangenheit');
  });

  await schritt('zip', async () => {
    const z = await Zip.make([{ name: 'a.txt', data: 'Grüße' }, { name: 'ordner/b.bin', data: new Uint8Array([1, 2, 3, 250]) }]);
    const m = await Zip.read(z);
    gleich(new TextDecoder().decode(m.get('a.txt')), 'Grüße', 'ZIP Text mit Umlauten');
    gleich([...m.get('ordner/b.bin')], [1, 2, 3, 250], 'ZIP Binärdaten');
    gleich(Zip.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'CRC32-Prüfwert');
  });

  let p, e1, fotoId;
  await schritt('daten', async () => {
    p = Data.neuePflanze('zimmer', { name: 'Testmonstera', artId: 'monstera-deliciosa', art: 'Monstera', giessTage: 7, erworben: U.plusTage(U.heute(), -30), preis: 12.5 });
    await Data.savePlant(p);
    fotoId = await Data.addFoto(await bildDatei('#3a7'));
    pruefe(!!(await Data.url(fotoId, true)) && !!(await Data.url(fotoId, false)), 'Foto-URL (Vorschau und Original)');
    e1 = Data.neuerEintrag(p.id, 'foto', { fotos: [fotoId], text: 'Erstes Foto' });
    await Data.saveEntry(e1);
    p.titelFoto = fotoId; await Data.savePlant(p);
    gleich(Data.liste('zimmer', 'aktiv').length, 1, 'Pflanze in Liste');
    gleich(Data.eintraege(p.id).length, 1, 'Eintrag da');
    // Neu laden aus der Datenbank
    await Data.load();
    pruefe(Data.plants.has(p.id) && Data.entries.has(e1.id), 'Nach Neuladen aus IndexedDB vorhanden');
    pruefe(!!(await Data.foto(fotoId)), 'Foto nach Neuladen vorhanden');
  });

  await schritt('pflege', async () => {
    const n = Pflege.naechste(p, 'giessen');
    gleich(n.in, -23, 'Gießen überfällig (erworben vor 30 Tagen, Intervall 7 → fällig vor 23 Tagen)');
    await Pflege.schnell(p, 'giessen');
    gleich(Pflege.naechste(p, 'giessen').in, 7, 'Nach Gießen in 7 Tagen');
    await Pflege.schnell(p, 'giessen', U.plusTage(U.heute(), -3));
    gleich(Pflege.naechste(p, 'giessen').in, 7, 'Rückdatierter Eintrag ändert nichts (letzter bleibt heute)');
    gleich(Pflege.naechste(Object.assign({}, p, { giessTage: null }), 'giessen'), null, 'Ohne Intervall nichts fällig');
    gleich(Pflege.naechste(Object.assign({}, p, { status: 'verkauft' }), 'giessen'), null, 'Archivierte Pflanze nicht fällig');
    gleich(Pflege.text({ in: -2 }), 'seit 2 Tagen überfällig', 'Text überfällig');
    gleich(Pflege.text({ in: 0 }), 'heute fällig', 'Text heute');
  });

  await schritt('sicherung', async () => {
    const privat = Data.neuePflanze('cannabis', { name: 'Grow 1', erworben: U.heute() }); await Data.savePlant(privat);
    await Data.saveEntry(Data.neuerEintrag(privat.id, 'phase', { werte: { phase: 'Keimung' } }));
    await Data.wunschSetzen('lithops', true);
    const voll = await Sicherung.erstellen({});
    const ohne = await Sicherung.erstellen({ ohnePrivat: true });
    const infoOhne = (await Sicherung.lesen(ohne)).info;
    gleich(infoOhne.plants.length, 1, 'Sicherung ohne Privates enthält nur die Zimmerpflanze');
    gleich(infoOhne.entries.every((x) => x.plantId === p.id), true, 'Keine privaten Einträge in der Sicherung ohne Privates');
    const anzahlPlants = Data.plants.size, anzahlEntries = Data.entries.size;
    await Data.alleLoeschen();
    gleich(Data.plants.size, 0, 'Nach Löschen leer');
    const r = await Sicherung.einspielen(voll, 'ersetzen');
    gleich(r.pflanzen, anzahlPlants, 'Pflanzen wiederhergestellt');
    gleich(Data.entries.size, anzahlEntries, 'Einträge wiederhergestellt');
    pruefe(!!(await Data.foto(fotoId)), 'Foto wiederhergestellt');
    pruefe(Data.wunsch().includes('lithops'), 'Wunschliste wiederhergestellt');
    // zusammenführen ändert nichts doppelt
    await Sicherung.einspielen(voll, 'zusammen');
    gleich(Data.plants.size, anzahlPlants, 'Zusammenführen erzeugt keine Dopplungen');
    let fehler = null; try { await Sicherung.lesen(new File([new Blob(['kaputt'])], 'x.zip')); } catch (e) { fehler = e; }
    pruefe(!!fehler, 'Ungültige Datei wird abgelehnt');
    await Data.delPlant(privat.id);
  });

  await schritt('loeschen', async () => {
    const q = Data.neuePflanze('zimmer', { name: 'Weg damit' }); await Data.savePlant(q);
    const f = await Data.addFoto(await bildDatei('#a73'));
    await Data.saveEntry(Data.neuerEintrag(q.id, 'foto', { fotos: [f] }));
    await Data.delPlant(q.id);
    pruefe(!Data.plants.has(q.id), 'Pflanze gelöscht');
    gleich(!!(await Data.foto(f)), false, 'Foto der gelöschten Pflanze entfernt');
    pruefe(!!(await Data.foto(fotoId)), 'Foto der anderen Pflanze bleibt');
  });

  await schritt('pin', async () => {
    await Privat.setzen('1234');
    pruefe(await Privat.pruefen('1234'), 'Richtige PIN');
    pruefe(!(await Privat.pruefen('4321')), 'Falsche PIN');
    gleich(Privat.cfg().len, 4, 'PIN-Länge gespeichert');
    pruefe(!JSON.stringify(Privat.cfg()).includes('1234'), 'PIN nicht im Klartext gespeichert');
    Einst.del('pin');
  });

  await schritt('seiten', async () => {
    for (const id of ['heute', 'sammlung', 'lexikon', 'wissen', 'mehr']) {
      App.tab(id); await warte(30);
      const top = document.querySelector('.page .body');
      pruefe(!!top && top.textContent.length > 20, 'Tab ' + id + ' zeigt Inhalt');
      pruefe(!document.querySelector('.box.rot'), 'Tab ' + id + ' ohne Fehlerbox');
    }
    const aufrufe = [];
    Gruen.arten.forEach((a) => aufrufe.push(['Art ' + a.id, () => Lexikon.detail(a.id)]));
    Gruen.wissen.forEach((x) => aufrufe.push(['Thema ' + x.id, () => Wissen.thema(x.id)]));
    Gruen.schaedlinge.forEach((x) => aufrufe.push(['Schädling ' + x.id, () => Wissen.schaedling(x.id)]));
    Gruen.diagnose.forEach((x) => aufrufe.push(['Symptom ' + x.id, () => Wissen.symptom(x.id)]));
    aufrufe.push(['Detail', () => Detail.seite(p.id)], ['Statistik', () => Mehr.statistik()], ['Einstellungen', () => Mehr.einstellungen()], ['Grow', () => Sammlung.seite('cannabis')]);
    for (const [name, fn] of aufrufe) {
      App.tab('heute');
      let d; try { d = fn(); } catch (e) { t.fails.push(name + ' wirft: ' + e.message); continue; }
      pruefe(d && typeof d.titel === 'string' && d.inhalt && d.inhalt.nodeType, name + ' liefert eine Seite');
      App.oeffne(() => d); // Seite wirklich aufbauen
    }
    App.tab('heute');
  });

  await schritt('formulare', async () => {
    // Pflanzenformular per Oberfläche
    let angelegt = null;
    Formen.pflanze('zimmer', null, (q) => { angelegt = q; });
    await warte(30);
    const sheet = document.querySelector('.sheet');
    pruefe(!!sheet, 'Pflanzenformular öffnet');
    const felder = sheet.querySelectorAll('input[type=text]');
    felder[0].value = 'Formular-Test'; felder[0].dispatchEvent(new Event('input'));
    [...sheet.querySelectorAll('.fuss .btn')].pop().click();
    await warte(150);
    pruefe(!!angelegt && angelegt.name === 'Formular-Test', 'Pflanze über Formular angelegt');
    pruefe(!document.querySelector('.sheet'), 'Formular schließt nach Speichern');
    // Eintrag gießen über Formular (Cannabis hat Zahlenfelder)
    const g = Data.neuePflanze('cannabis', { name: 'G' }); await Data.savePlant(g);
    Formen.eintrag(g, 'giessen', null, () => {});
    await warte(30);
    const s2 = document.querySelector('.sheet');
    const z = s2.querySelectorAll('input[type=text]'); z[0].value = '500'; z[1].value = '6,2';
    [...s2.querySelectorAll('.fuss .btn')].pop().click();
    await warte(150);
    const e = Data.eintraege(g.id)[0];
    gleich([e.werte.menge, e.werte.ph], [500, 6.2], 'Zahlenfelder gespeichert (Komma)');
    await Data.delPlant(g.id);
    if (angelegt) await Data.delPlant(angelegt.id);
  });

  await schritt('inhalt', async () => {
    const ids = new Set(Gruen.arten.map((a) => a.id));
    gleich(ids.size, Gruen.arten.length, 'Art-IDs eindeutig');
    pruefe(Lexikon.filtern().length === Gruen.arten.length, 'Lexikon ohne Filter zeigt alle');
    Lexikon.zustand.q = 'albo'; const l = Lexikon.filtern(); Lexikon.zustand.q = '';
    pruefe(l.some((a) => a.id === 'monstera-albo'), 'Lexikon-Suche findet „albo“');
    Lexikon.zustand.f = 'rar'; const r = Lexikon.filtern(); Lexikon.zustand.f = 'alle';
    pruefe(r.length > 0 && r.every((a) => a.selten >= 3), 'Filter Raritäten');
  });

  // Aufräumen: deine Daten zurück
  window.removeEventListener('error', onerr);
  await schritt('wiederherstellen', async () => {
    await Data.alleLoeschen();
    await Sicherung.einspielen(meineDaten, 'ersetzen');
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('gruen.')) localStorage.removeItem(k); }
    for (const k in meineEinst) localStorage.setItem(k, meineEinst[k]);
    Privat.offen = false;
    App.tab('heute');
  });
  if (fehlerAlt.length) t.errors.push('Fehler im Fenster: ' + fehlerAlt.join(' | '));

  t.zusammenfassung = t.ok + ' Prüfungen ok, ' + t.fails.length + ' fehlgeschlagen, ' + t.errors.length + ' Fehler';
  window.gruenTest = t;
  console.log('[selftest]', t.zusammenfassung, t.fails, t.errors);
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:999;max-height:60%;overflow:auto;padding:12px;border-radius:12px;font:12px/1.4 monospace;white-space:pre-wrap;color:#fff;background:' + (t.fails.length || t.errors.length ? '#a23a2e' : '#2e5339');
  box.textContent = t.zusammenfassung + (t.fails.length ? '\n\nFEHLGESCHLAGEN:\n- ' + t.fails.join('\n- ') : '') + (t.errors.length ? '\n\nFEHLER:\n' + t.errors.join('\n\n') : '');
  box.onclick = () => box.remove();
  document.body.append(box);
})();
