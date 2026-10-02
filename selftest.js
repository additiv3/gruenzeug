/* GRUENZEUG – Selbsttest im Browser. Aufruf: http://localhost:8140/index.html?selftest
   Sichert deine Daten (als Sicherungsdatei im Speicher), löscht alles, prüft Daten, Sicherung, Pflege-Rechnung,
   PIN und alle Seiten, und stellt danach deine Daten wieder her. Ergebnis: window.gruenTest {fails, errors, ok}
   und ein Kasten auf der Seite. Neue Funktionen → hier ergänzen. */
(async function selftest() {
  const { App, Data, Gruen, Einst, Sicherung, Pflege, Privat, U, Zip, Sync, Krypto, Spiel, Kunst, Fx } = window.gruen;
  const t = { ok: 0, fails: [], errors: [], uebersprungen: [] };
  const pruefe = (b, msg) => { if (b) t.ok++; else t.fails.push(msg); };
  const gleich = (a, b, msg) => pruefe(JSON.stringify(a) === JSON.stringify(b), msg + ' – erwartet ' + JSON.stringify(b) + ', war ' + JSON.stringify(a));
  const schritt = async (name, fn) => { try { await fn(); } catch (e) { t.errors.push(name + ': ' + (e && e.stack || e)); } };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const bildDatei = (farbe) => new Promise((res) => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = farbe; x.fillRect(0, 0, 320, 240); c.toBlob((b) => res(new File([b], 'x.png', { type: 'image/png' })), 'image/png'); });
  const fehlerAlt = []; const onerr = (e) => fehlerAlt.push(e.message || String(e)); window.addEventListener('error', onerr);

  // Sicherung der echten Daten
  const meineEinst = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('gruen.')) meineEinst[k] = localStorage.getItem(k); }
  const meineDaten = await Sicherung.erstellen({});
  Einst.del('sync');   // wichtig: Testdaten dürfen nie in die echte Cloud gelangen
  await Data.alleLoeschen(); Einst.del('pin'); Privat.offen = false; Krypto.key = null;

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
    gleich(Privat.cfg().iter, 600000, 'Neue PIN nutzt 600000 Iterationen');
    // alter Stand ohne iter (200000) lässt sich weiter entsperren
    const altSalz = Krypto.neuesSalz(), altKey = await Krypto.ableiten('2468', altSalz);
    Einst.set('pin', { v: 2, salt: altSalz, canary: await Krypto.encMit(altKey, 'gruenzeug-ok'), len: 4, u: 1 });
    pruefe(await Privat.pruefen('2468'), 'PIN aus altem Format (ohne iter) entsperrt weiter');
    pruefe(!(await Privat.pruefen('2469')), 'Falsche PIN im alten Format wird abgelehnt');
    Privat._fehl = 0; for (let i = 0; i < 5; i++) Privat.fehlversuch();
    pruefe(Privat.bremse() > 0, 'Nach 5 Fehlversuchen greift die Wartezeit'); Privat._fehl = 0; Privat._bis = 0;
    pruefe(Privat.bremse() === 0, 'Wartezeit endet');
    await Privat.setzen('1234');
    Einst.del('pin');
  });

  await schritt('krypto', async () => {
    const key = await Krypto.ableiten('4711', Krypto.neuesSalz());
    const s = await Krypto.encMit(key, { a: 'Grüße', n: 3 });
    gleich(await Krypto.decMit(key, s), { a: 'Grüße', n: 3 }, 'Verschlüsseln und Entschlüsseln');
    const falsch = await Krypto.ableiten('4712', Krypto.neuesSalz());
    let f = null; try { await Krypto.decMit(falsch, s); } catch (e) { f = e; }
    pruefe(!!f, 'Falscher Schlüssel kann nicht entschlüsseln');
    const b = new Uint8Array([9, 8, 7, 0, 255]);
    gleich([...(await Krypto.entBytesMit(key, await Krypto.bytesMit(key, b)))], [9, 8, 7, 0, 255], 'Bytes verschlüsseln');
  });

  await schritt('cloud', async () => {
    const MOCK = 'http://localhost:8141';
    let da = false; try { da = (await fetch(MOCK + '/__test/reset')).ok; } catch (e) { /* Nachbau läuft nicht */ }
    if (!da) { t.uebersprungen.push('Cloud-Sync (Nachbau auf Port 8141 nicht gestartet: py tools/mock_supabase.py)'); return; }
    Sync.test = { url: MOCK, key: 'test' };
    const syncen = async () => { for (let i = 0; i < 100 && Sync.status.laeuft; i++) await warte(20); const ok = await Sync.sync(); pruefe(ok || !Sync.status.fehler, 'Sync ohne Fehler: ' + Sync.status.fehler); };
    const dump = async () => (await fetch(MOCK + '/__test/dump')).json();
    const neuesGeraet = async () => { await Data.alleLoeschen(); Einst.del('pin'); Einst.del('sync'); Krypto.key = null; Privat.offen = false; };
    try {
      await Data.alleLoeschen(); Einst.del('pin'); Einst.del('sync'); Krypto.key = null; Privat.offen = false;

      // Daten vor der Anmeldung (wie ein Nutzer mit schon vorhandenen Pflanzen)
      const z1 = Data.neuePflanze('zimmer', { name: 'Cloud-Monty', giessTage: 7 }); await Data.savePlant(z1);
      const f1 = await Data.addFoto(await bildDatei('#2a6'));
      const e1 = Data.neuerEintrag(z1.id, 'foto', { fotos: [f1], text: 'Zimmer-Eintrag' }); await Data.saveEntry(e1);
      await Privat.setzen('987654');
      const g1 = Data.neuePflanze('cannabis', { name: 'Grow-Geheim' }); await Data.savePlant(g1);
      const f2 = await Data.addFoto(await bildDatei('#a62'));
      const ge1 = Data.neuerEintrag(g1.id, 'notiz', { text: 'Geheimnotiz', fotos: [f2] }); await Data.saveEntry(ge1);
      await Data.wunschSetzen('lithops', true);
      Spiel.vergessen(); Spiel.s().name = 'Cloud-Pflänzchen'; Spiel.s().tau = 55; await Spiel.speichern(true);

      // Anmelden
      let fehler = null; try { await Sync.anmelden('a@b.de', 'falsch1234'); } catch (e) { fehler = e; }
      pruefe(!!fehler && /stimmt nicht/.test(fehler.message), 'Falsche Anmeldung wird abgelehnt');
      gleich(await Sync.registrieren('a@b.de', 'geheim1234'), 'angemeldet', 'Registrieren');
      let doppelt = null; try { await Sync.registrieren('a@b.de', 'geheim1234'); } catch (e) { doppelt = e; }
      pruefe(!!doppelt && /schon ein Konto/.test(doppelt.message), 'Doppelte Registrierung wird erklärt');
      pruefe(Sync.angemeldet(), 'Angemeldet');
      await syncen();

      let d = await dump(); const txt = JSON.stringify(d.docs);
      gleich(d.docs.filter((x) => !x.deleted).length, 7, 'Erster Abgleich lädt 2 Pflanzen, 2 Einträge, Wunschliste, Sprössling und PIN-Daten hoch');
      pruefe(!txt.includes('Grow-Geheim') && !txt.includes('Geheimnotiz'), 'Privater Bereich liegt nur verschlüsselt in der Cloud');
      pruefe(txt.includes('Cloud-Monty'), 'Normale Daten liegen lesbar in der Cloud');
      pruefe(d.objs.includes('u1/' + f1 + '.jpg') && d.objs.includes('u1/' + f2 + '.enc') && !d.objs.includes('u1/' + f2 + '.jpg'), 'Fotos hochgeladen, privates verschlüsselt (.enc)');
      gleich(await Sync.offen(), 0, 'Warteschlange leer nach Abgleich');

      // Weitere Änderung nach der Anmeldung
      const z2 = Data.neuePflanze('zimmer', { name: 'Nachher-Pflanze' }); await Data.savePlant(z2);
      await syncen();
      d = await dump();
      pruefe(d.docs.some((x) => x.id === z2.id && !x.deleted), 'Neue Pflanze nach der Anmeldung wird hochgeladen');

      // Neues Gerät: alles weg, wieder anmelden
      await neuesGeraet();
      gleich(Data.plants.size, 0, 'Gerät ist leer');
      await Sync.anmelden('a@b.de', 'geheim1234');
      await syncen();
      pruefe(Data.plants.has(z1.id) && Data.plants.has(z2.id), 'Pflanzen kommen aus der Cloud zurück');
      gleich(Data.plants.get(z1.id).name, 'Cloud-Monty', 'Inhalt unverändert');
      pruefe(Data.entries.has(e1.id), 'Eintrag kommt zurück');
      pruefe(Data.wunsch().includes('lithops'), 'Wunschliste kommt zurück');
      pruefe(Spiel.s().name === 'Cloud-Pflänzchen' && Spiel.s().tau === 55, 'Sprössling kommt aus der Cloud zurück');
      pruefe(!!(await Data.url(f1, true)), 'Foto wird beim Ansehen aus der Cloud geladen');
      gleich(Data.liste('cannabis').length, 0, 'Privater Bereich bleibt gesperrt (nichts sichtbar)');
      pruefe(Privat.aktiv(), 'PIN-Einrichtung kommt aus der Cloud');
      pruefe(!(await Privat.pruefen('111111')), 'Falsche PIN auf dem neuen Gerät');
      pruefe(await Privat.pruefen('987654'), 'Richtige PIN auf dem neuen Gerät');
      await Sync.nachEntsperren();
      pruefe(Data.plants.has(g1.id) && Data.plants.get(g1.id).name === 'Grow-Geheim', 'Privater Bereich wird nach Entsperren entschlüsselt');
      gleich(Data.entries.get(ge1.id) && Data.entries.get(ge1.id).text, 'Geheimnotiz', 'Privater Eintrag lesbar');
      pruefe(!!(await Data.url(f2, true)), 'Privates Foto wird entschlüsselt geladen');

      // Neueres gewinnt
      const tok = await Sync.token();
      const rem = Object.assign({}, Data.plants.get(z1.id), { name: 'Remote-Name', u: Date.now() + 5000 });
      await fetch(MOCK + '/rest/v1/docs?on_conflict=user_id,kind,id', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: 'test', 'content-type': 'application/json' }, body: JSON.stringify([{ user_id: 'u1', kind: 'plant', id: z1.id, data: rem, u: rem.u, deleted: false }]) });
      await syncen();
      gleich(Data.plants.get(z1.id).name, 'Remote-Name', 'Neuere Änderung aus der Cloud gewinnt');
      const lokal = Data.plants.get(z2.id); lokal.name = 'Lokal-Neu'; await Data.savePlant(lokal);
      await fetch(MOCK + '/rest/v1/docs?on_conflict=user_id,kind,id', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: 'test', 'content-type': 'application/json' }, body: JSON.stringify([{ user_id: 'u1', kind: 'plant', id: z2.id, data: Object.assign({}, lokal, { name: 'Alt' }), u: 5, deleted: false }]) });
      await syncen();
      gleich(Data.plants.get(z2.id).name, 'Lokal-Neu', 'Ältere Cloud-Version überschreibt nichts');

      // Löschen
      await Data.delEntry(e1.id);
      await syncen();
      d = await dump();
      pruefe(d.docs.some((x) => x.id === e1.id && x.deleted), 'Gelöschter Eintrag wird als gelöscht markiert');
      pruefe(!d.objs.includes('u1/' + f1 + '.jpg'), 'Foto des gelöschten Eintrags wird aus der Cloud entfernt');
      await neuesGeraet();
      await Sync.anmelden('a@b.de', 'geheim1234'); await syncen();
      pruefe(!Data.entries.has(e1.id) && Data.plants.has(z1.id), 'Auf dem neuen Gerät fehlt der gelöschte Eintrag, die Pflanze bleibt');

      // Sitzung erneuern
      await fetch(MOCK + '/__test/expire');
      const z3 = Data.neuePflanze('zimmer', { name: 'Nach-Ablauf' }); await Data.savePlant(z3);
      await syncen();
      d = await dump();
      pruefe(d.docs.some((x) => x.id === z3.id), 'Abgelaufene Sitzung wird automatisch erneuert');

      // PIN ändern: privater Bereich wird neu verschlüsselt hochgeladen
      await Privat.pruefen('987654'); await Sync.nachEntsperren();
      pruefe(Data.plants.has(g1.id), 'Entsperrt: privater Bereich da');
      const vorher = (await dump()).docs.find((x) => x.id === g1.id).data._enc;
      await Privat.setzen('55556666');
      await syncen();
      const nachher = (await dump()).docs.find((x) => x.id === g1.id).data._enc;
      pruefe(vorher !== nachher, 'Nach PIN-Änderung neu verschlüsselt hochgeladen');

      // Abmelden
      await Sync.abmelden();
      pruefe(!Sync.angemeldet(), 'Abmelden');
      pruefe(Data.plants.has(z1.id), 'Daten bleiben nach Abmelden im Gerät');
    } finally {
      Sync.test = null; Einst.del('sync'); Einst.del('pin'); Krypto.key = null; Privat.offen = false;
      await Data.alleLoeschen(); await Data.savePlant(p);   // Zustand für die folgenden Schritte
    }
  });

  await schritt('seiten', async () => {
    for (const id of ['heute', 'sammlung', 'spiel', 'lexikon', 'wissen', 'mehr']) {
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
    aufrufe.push(['Detail', () => Detail.seite(p.id)], ['Statistik', () => Mehr.statistik()], ['Einstellungen', () => Mehr.einstellungen()], ['Grow', () => Sammlung.seite('cannabis')],
      ['Design', () => Design.seite()], ['Pflegeplan', () => Plan.seite()], ['Erfolge', () => Erfolge.seite()], ['Bildnachweis', () => Bildnachweis.seite()], ['Herbarium', () => Spiel.herbarium()], ['Laden', () => Spiel.laden()], ['Suche', () => Suche.seite()], ['Startseite anpassen', () => Heute.anpassen()]);
    for (const [name, fn] of aufrufe) {
      App.tab('heute');
      let d; try { d = fn(); } catch (e) { t.fails.push(name + ' wirft: ' + e.message); continue; }
      pruefe(d && typeof d.titel === 'string' && d.inhalt && d.inhalt.nodeType, name + ' liefert eine Seite');
      App.oeffne(() => d); // Seite wirklich aufbauen
    }
    App.tab('heute');
  });

  await schritt('einspielen-pruefen', async () => {
    const gut = { id: 'p1', kind: 'zimmer', name: 'Gut', fakten: [] };
    const roh = { plants: [gut, { id: '../x', kind: 'zimmer', name: 'Pfad' }, { id: 'p2', kind: 'unbekannt', name: 'x' }, null, 'text', { id: 'p3', kind: 'zimmer', name: 5 }, { id: 'p4', kind: 'zimmer', name: 'Foto', titelFoto: '<img src=x>' }],
      entries: [{ id: 'e1', plantId: 'p1', typ: 'notiz', datum: '2026-01-02', text: 'ok', fotos: ['f1'], werte: {} }, { id: 'e2', plantId: 'p1', typ: 'notiz', datum: 'gestern' }, { id: 'e3', plantId: 'p1', typ: 'notiz', datum: '2026-01-02', fotos: 'f1' }, 42],
      photos: [{ id: 'f1' }, { id: '..\\boese' }] };
    const r = Sicherung.pruefe(roh);
    gleich(r.plants.length, 1, 'Nur die wohlgeformte Pflanze bleibt'); gleich(r.entries.length, 1, 'Nur der wohlgeformte Eintrag bleibt'); gleich(r.photos.length, 1, 'Nur sichere Foto-IDs bleiben');
    gleich(r.verworfen, 9, 'Verworfene Dokumente werden gezählt');
    gleich(Sicherung.pruefe({}).plants.length, 0, 'Leere Sicherung schadet nicht');
  });

  await schritt('design-und-extras', async () => {
    // Design: jedes Theme in Hell und Dunkel, alle Optionen setzen sich als Attribute
    const alt = Einst.get('design', null);
    for (const th of Design.THEMES) for (const modus of ['hell', 'dunkel']) {
      Design.setzen('theme', th.id); Design.setzen('modus', modus);
      pruefe((document.documentElement.dataset.mode === 'dark') === (modus === 'dunkel'), 'Design ' + th.id + '/' + modus + ' setzt den Modus');
      pruefe(th.id === 'feld' ? !document.documentElement.dataset.theme : document.documentElement.dataset.theme === th.id, 'Design ' + th.id + ' setzt das Theme');
    }
    Design.setzen('akzent', 'beere'); pruefe(!!document.documentElement.style.getPropertyValue('--accent'), 'Akzentfarbe setzt --accent');
    Design.setzen('akzent', 'standard'); pruefe(!document.documentElement.style.getPropertyValue('--accent'), 'Akzent Standard entfernt --accent');
    for (const [k, v] of [['ecken', 'weich'], ['ecken', 'kantig'], ['schrift', 'sans'], ['schrift', 'mono'], ['tabs', 'schwebend'], ['tabs', 'kompakt'], ['spalten', 3]]) {
      Design.setzen(k, v); App.tab('sammlung'); await warte(20); pruefe(!document.querySelector('.box.rot'), 'Seite baut mit Design ' + k + '=' + v);
    }
    Einst.del('design'); if (alt) Einst.set('design', alt); Design.anwenden();
    pruefe(Design.get().theme === (alt && alt.theme || 'feld'), 'Design zurückgesetzt');
    Einst.set('design', { theme: 'kaputt', ecken: 5 }); pruefe(Design.get().theme === 'kaputt' && Design.get().ecken === 'rund', 'Design.get ignoriert Werte mit falschem Typ'); Einst.del('design'); Design.anwenden();

    // Lexikon-Bilder: jede Bilddatei ist erreichbar
    const mitBild = Gruen.arten.filter((a) => Gruen.bild(a.id));
    pruefe(mitBild.length >= 40, 'Lexikon-Fotos vorhanden (' + mitBild.length + ')');
    const kaputt = [];
    for (const a of mitBild) { try { const r = await fetch(Gruen.bild(a.id).src); if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) kaputt.push(a.id); } catch (e) { kaputt.push(a.id); } }
    pruefe(!kaputt.length, 'Alle Lexikon-Fotos laden' + (kaputt.length ? ': ' + kaputt.join(', ') : ''));
    pruefe(mitBild.every((a) => { const b = Gruen.bild(a.id); return b.urheber && b.lizenz && b.seite; }), 'Jedes Foto hat Urheber, Lizenz und Quelle');
    pruefe(!!document.querySelector('meta[http-equiv="Content-Security-Policy"]') || location.protocol === 'file:', 'Content-Security-Policy gesetzt');

    // Heute-Widgets: ausblenden und Reihenfolge
    const plan = Heute.widgetPlan();
    pruefe(plan.order.length === Heute.WIDGETS.length, 'Widget-Plan enthält alle Widgets');
    Einst.set('heuteWidgets', { order: ['zuletzt', 'stat'], off: ['tipp', 'unbekannt'] });
    const p2 = Heute.widgetPlan();
    pruefe(p2.order[0] === 'spross' && p2.order[1] === 'zuletzt' && p2.order.length === Heute.WIDGETS.length && new Set(p2.order).size === p2.order.length, 'Widget-Plan ergänzt fehlende Widgets');
    App.tab('heute'); await warte(20);
    pruefe(!document.querySelector('.tipp'), 'Ausgeblendetes Widget fehlt auf Heute');
    Einst.del('heuteWidgets'); App.tab('heute');

    // Pflegeplan und Kalender-Export
    const pf = Data.neuePflanze('zimmer', { name: 'Plan-Test', giessTage: 3, duengerTage: 14, erworben: U.plusTage(U.heute(), -1) });
    await Data.savePlant(pf);
    const tage = Plan.tage(7);
    pruefe(tage.length === 7 && tage[2].items.some((x) => x.p.id === pf.id && x.typ === 'giessen'), 'Pflegeplan: Gießen in 2 Tagen');
    pruefe(tage[5].items.some((x) => x.p.id === pf.id && x.typ === 'giessen'), 'Pflegeplan: Gießen wiederholt sich');
    let ics = null; const altSp = Sicherung.speichern; Sicherung.speichern = async (blob) => { ics = await blob.text(); return 'geteilt'; };
    await Plan.ics(); Sicherung.speichern = altSp;
    pruefe(!!ics && ics.startsWith('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=DAILY;INTERVAL=3') && ics.includes('SUMMARY:Gießen: Plan-Test') && ics.includes('TRIGGER'), 'Kalender-Datei (.ics) enthält Erinnerungen');
    pruefe(!!ics && ics.split('\r\n').join('').indexOf('\n') === -1, 'Kalender-Datei nutzt CRLF');
    await Data.delPlant(pf.id);

    // Serie und Erfolge
    const q = Data.neuePflanze('zimmer', { name: 'Serie-Test' }); await Data.savePlant(q);
    for (let i = 0; i < 3; i++) await Data.saveEntry(Data.neuerEintrag(q.id, 'notiz', { datum: U.plusTage(U.heute(), -i) }));
    const r = Serie.rechne();
    pruefe(r.aktuell >= 3 && r.beste >= 3, 'Serie zählt drei Tage in Folge');
    pruefe(Erfolge.liste().find((x) => x.id === 'serie3').wert >= 3, 'Erfolg „Dranbleiben“ erreicht');
    await Data.delPlant(q.id);

    // Quiz
    Quiz.neu();
    pruefe(Quiz.z.fragen.length === 10, 'Quiz hat 10 Fragen');
    pruefe(Quiz.z.fragen.every((f) => f.opt.length === 4 && new Set(f.opt).size === 4 && f.opt.includes(f.art)), 'Quiz: vier verschiedene Antworten, eine richtig');
    for (let i = 0; i < 10; i++) {
      const f = Quiz.z.fragen[i]; f.antwort = f.art; Quiz.z.richtig++; Quiz.z.i = i;
      const d = Quiz.seite(); pruefe(d && d.inhalt && d.inhalt.nodeType, 'Quiz Frage ' + (i + 1) + ' baut');
    }
    Quiz.z.fertig = true; pruefe(Quiz.seite().inhalt.textContent.includes('10 / 10'), 'Quiz-Ergebnis zeigt 10 / 10'); Quiz.z = null;
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

  await schritt('sproessling', async () => {
    const H = 36e5;
    const T0 = new Date(); T0.setHours(7, 0, 0, 0); const t0 = T0.getTime() - 20 * 24 * H;   // Start vor 20 Tagen um 7 Uhr
    const imBereich = (s) => ['wasser', 'nahrung', 'licht', 'laune'].every((k) => s[k] >= 0 && s[k] <= 100 && isFinite(s[k])) && isFinite(s.wachs);

    // Frischer Zustand
    await Data.setMeta('spiel', null); Spiel.vergessen(); let s = Spiel.s();
    gleich([s.stufe, s.gekeimt, s.tau], [0, false, 10], 'Neuer Sprössling');
    pruefe(!!s.tag && s.tag.quests.length === 3, 'Drei Tagesaufgaben');

    // Vernachlässigt: wächst nicht, stirbt nicht, Werte bleiben im Bereich
    s.t = t0; Spiel.tick(t0 + 200 * H);
    pruefe(imBereich(s) && s.stufe === 0 && s.wasser === 0, 'Vernachlässigter Samen: bleibt Samen, Werte im Bereich');
    pruefe(Math.abs(s.t - (t0 + 200 * H)) < H, 'Höchstens 96 Stunden werden nachgerechnet');

    // Gute Pflege: Lampe 7–21 Uhr, gießen und düngen nach Bedarf
    Spiel.vergessen(); s = Spiel.s(); s.t = t0; s.tag = null;
    const stufen = [0];
    for (let i = 0; i < 24 * 12; i++) {
      const h = new Date(t0 + i * H).getHours();
      s.lampe = h >= 7 && h < 21;
      Spiel.tick(t0 + (i + 1) * H);
      if (s.wasser < 45) Spiel.giessen();
      if (s.nahrung < 35) Spiel.duengen();
      if (s.laune < 80) Spiel.streicheln();
      if (s.stufe !== stufen[stufen.length - 1]) stufen.push(s.stufe);
      if (s.stufe === 5) break;
    }
    pruefe(imBereich(s), 'Gute Pflege: Werte im Bereich');
    gleich(stufen, [0, 1, 2, 3, 4, 5], 'Gute Pflege: alle Stufen werden durchlaufen');
    pruefe(!!s.art && Spiel.ARTEN.some((a) => a.id === s.art), 'Blüte: Art steht fest (' + s.art + ')');
    pruefe(s.feier && s.feier.typ === 'bluete', 'Feier-Meldung für die Blüte');
    // Blüte pressen
    const tau0 = s.tau, art = s.art;
    const r = Spiel.ernten('Zweiter');
    pruefe(r && r.art === art && r.neu && s.stufe === 0 && s.name === 'Zweiter' && s.herbar[art].n === 1 && s.tau > tau0, 'Pressen: Herbarium, neuer Samen, Tau');
    pruefe(Spiel.ernten('x') === null, 'Samen lässt sich nicht pressen');

    // Gießen/Düngen: zu viel schadet
    s.wasser = 95; const l0 = s.laune; const g = Spiel.giessen();
    pruefe(!g.ok && s.laune < l0 && s.wasser === 95, 'Zu viel Wasser schadet der Laune');
    s.nahrung = 80; pruefe(!Spiel.duengen().ok, 'Zu viel Dünger wird abgelehnt');
    s.wasser = 10; pruefe(Spiel.giessen().ok && s.wasser === 65, 'Gießen füllt auf');

    // Arten-Zuordnung
    const b = (l, w, n, f) => Spiel.bestimme({ l, w, n, f });
    gleich([b(90, 85, 80, 90), b(80, 30, 50, 50), b(20, 50, 50, 50), b(50, 80, 50, 50), b(70, 90, 50, 50), b(60, 50, 80, 50), b(60, 60, 65, 50), b(65, 60, 50, 80), b(80, 60, 50, 50), b(65, 60, 50, 50)],
      ['sternorchidee', 'zauberkaktus', 'leuchtpilz', 'mondfarn', 'traenenfarn', 'gluehbeere', 'honigranke', 'bluetenfee', 'sonnenblatt', 'moosbaer'], 'Zuordnung der Arten');

    // Laden
    s.tau = 5; pruefe(!Spiel.kaufen('deko', 'pilze').ok, 'Zu wenig Tau: Kauf scheitert');
    s.tau = 100; pruefe(Spiel.kaufen('deko', 'pilze').ok && s.tau === 88 && s.deko.platz.sill_l === 'pilze', 'Kauf stellt die Deko auf');
    Spiel.stellen('deko', 'pilze'); pruefe(!s.deko.platz.sill_l, 'Wegräumen'); Spiel.stellen('deko', 'pilze'); pruefe(s.deko.platz.sill_l === 'pilze', 'Wieder aufstellen');
    pruefe(!Spiel.kaufen('deko', 'pilze').ok, 'Doppelt kaufen nicht möglich');
    s.tau = 100; Spiel.kaufen('topf', 'gold'); pruefe(s.topf === 'gold', 'Topf gekauft und genommen');

    // Jagd: Belohnung nur für die ersten drei Runden
    s.tag.spiele = 0; const t1 = s.tau;
    const j1 = Spiel.jagdFertig(12); gleich([j1.tau, j1.belohnt], [4, true], 'Jagd: Belohnung'); Spiel.jagdFertig(3); Spiel.jagdFertig(3);
    const j4 = Spiel.jagdFertig(30); gleich([j4.tau, j4.belohnt], [0, false], 'Jagd: vierte Runde ohne Belohnung');
    pruefe(s.tau >= t1 + 4, 'Jagd bringt Tau');

    // Echte Pflege bringt Tau
    const echt = Data.neuePflanze('zimmer', { name: 'Spiel-Test' }); await Data.savePlant(echt);
    s.tag.echt = 0; const t2 = s.tau;
    await Data.saveEntry(Data.neuerEintrag(echt.id, 'giessen', { datum: s.tag.d }));
    Spiel.echtePflege(s); gleich(s.tau - t2, 1, 'Echtes Gießen: +1 Tau'); Spiel.echtePflege(s); gleich(s.tau - t2, 1, 'Echtes Gießen zählt nur einmal');
    await Data.delPlant(echt.id);

    // Besucher
    s.ereignis = { typ: 'laus', bis: Date.now() + H, laeuse: [1, 1, 1, 1, 1] };
    for (let i = 0; i < 4; i++) pruefe(Spiel.ereignisTippen('laus', i).fertig === false, 'Laus ' + i + ' weggewischt');
    pruefe(Spiel.ereignisTippen('laus', 4).fertig === true && !s.ereignis, 'Letzte Laus: Besuch vorbei');
    s.ereignis = { typ: 'laus', bis: Date.now() - 1, laeuse: [1, 0, 0, 0, 0] }; const l1 = s.laune; Spiel.ereignisPruefen(s, Date.now());
    pruefe(!s.ereignis && s.laune < l1, 'Läuse unbehandelt: Laune sinkt');

    // Aufräumen fremder Daten
    const roh = { stufe: 99, name: 'x'.repeat(50), tau: -5, art: 'bogus', lampe: 1, deko: { besitz: ['pilze', 'unbekannt', 'pilze'], platz: { sill_l: 'eule', sill_r: 'eule' } }, herbar: { moosbaer: { n: 'x', erst: 'gestern' }, boese: { n: 1 } }, ereignis: { typ: 'drache' }, tag: { d: '2026-01-01', quests: ['giessen', 'boese'] }, topf: 'unsichtbar', wasser: 'viel', zub: 'kroenchen' };
    const sa = Spiel.saeubern(roh);
    pruefe(sa && sa.stufe === 5 && sa.name.length === 16 && sa.tau === 0 && sa.art === null && sa.lampe === true, 'Säubern: Zahlen, Text, Art');
    gleich(sa.deko, { besitz: ['pilze'], platz: {} }, 'Säubern: Deko nur bekannt und am richtigen Platz');
    pruefe(sa.herbar.moosbaer && sa.herbar.moosbaer.n === 1 && !sa.herbar.boese && sa.herbar.moosbaer.erst === '2026-01-01', 'Säubern: Herbarium');
    pruefe(!sa.ereignis && sa.topf === 'terra' && sa.zub === null && sa.wasser === 30 && sa.tag.quests.length === 1, 'Säubern: Ereignis, Topf, Zubehör, Tag');
    pruefe(Spiel.saeubern(null) === null && Spiel.saeubern([]) === null && Spiel.saeubern('x') === null, 'Säubern: Nicht-Objekte');

    // Sicherung enthält den Sprössling und stellt ihn wieder her
    s = Spiel.s(); s.name = 'Rundreise'; s.tau = 77; await Spiel.speichern(true);
    const blob = await Sicherung.erstellen({}); const gelesen = await Sicherung.lesen(blob);
    pruefe(gelesen.info.meta.spiel && gelesen.info.meta.spiel.name === 'Rundreise', 'Sicherung enthält den Sprössling');
    await Data.alleLoeschen(); pruefe(Spiel.s().name === 'Sprössling', 'Nach dem Löschen: neuer Sprössling');
    await Sicherung.einspielen(blob, 'ersetzen'); pruefe(Spiel.s().name === 'Rundreise' && Spiel.s().tau === 77, 'Wiederherstellen bringt den Sprössling zurück');

    // Zeichnungen: jede Art und Stufe, jede Tageszeit, ohne NaN
    const bunt = [];
    for (const a of Spiel.ARTEN) for (let st = 0; st <= 5; st++) for (const welk of [0, 1]) {
      const sz = Kunst.Szene.bauen(); const z = Spiel.neu(); z.stufe = st; z.art = a.id; z.wasser = welk ? 2 : 80; z.deko.platz = { sill_l: 'feetuer', sill_r: 'kristall', hang: 'ampel', fenster: 'ballon' }; z.zub = 'kroenchen';
      for (const h of [3, 7, 12, 19, 23]) { const d = new Date(); d.setHours(h, 30); sz.set(Spiel.szene(z, d.getTime())); const x = sz.el.outerHTML; if (/NaN|undefined|Infinity/.test(x)) bunt.push(a.id + '/' + st + '/' + h); }
    }
    pruefe(!bunt.length, 'Szenen ohne NaN/undefined' + (bunt.length ? ': ' + bunt.slice(0, 5).join(', ') : ''));
    for (const d of Spiel.DEKO) { const x = Kunst.Szene.DEKO[d.id] ? Kunst.Szene.DEKO[d.id](.5) : ''; pruefe(x.length > 10 && !/NaN|undefined/.test(x), 'Deko-Zeichnung ' + d.id); }
    for (const art of ['regal', 'suche', 'ruhe', 'wunsch']) pruefe(!!Kunst.leer(art), 'Leere-Seite-Bild ' + art);
    let fxFehler = null; try { Fx.burst(50, 50, 'tropfen', 4); Fx.burst(50, 50, 'laub', 4); Fx.burst(50, 50, 'unbekannt', 2); } catch (e) { fxFehler = e.message; }
    pruefe(!fxFehler, 'Partikel-Effekte laufen ' + (fxFehler || ''));

    // Seiten
    Spiel.vergessen(); App.tab('spiel'); await warte(60);
    pruefe(!!document.querySelector('.spiel-szene svg') && !document.querySelector('.box.rot'), 'Spielseite baut sich auf');
    const karte = Spiel.karte(); pruefe(!!karte.querySelector('svg'), 'Karte für Heute');
    document.querySelectorAll('.akt')[0].click(); await warte(30);
    pruefe(Spiel.s().tag.giessen === 1, 'Knopf Gießen wirkt');
    document.querySelectorAll('.toast, .kanne-fx, .fx').forEach((e) => e.remove());
    clearTimeout(Spiel._sp); await Data.setMeta('spiel', null); Spiel.vergessen();
  });

  // Aufräumen: deine Daten zurück
  window.removeEventListener('error', onerr);
  await schritt('wiederherstellen', async () => {
    await Data.alleLoeschen();
    await Sicherung.einspielen(meineDaten, 'ersetzen');
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('gruen.')) localStorage.removeItem(k); }
    for (const k in meineEinst) localStorage.setItem(k, meineEinst[k]);
    // war ein Konto angemeldet: beim nächsten Abgleich alles neu vergleichen (die Warteschlange wurde geleert)
    if (meineEinst['gruen.sync']) { const c = JSON.parse(meineEinst['gruen.sync']); c.cursor = null; localStorage.setItem('gruen.sync', JSON.stringify(c)); }
    Privat.offen = false;
    App.tab('heute');
  });
  if (fehlerAlt.length) t.errors.push('Fehler im Fenster: ' + fehlerAlt.join(' | '));

  t.zusammenfassung = t.ok + ' Prüfungen ok, ' + t.fails.length + ' fehlgeschlagen, ' + t.errors.length + ' Fehler' + (t.uebersprungen.length ? ', übersprungen: ' + t.uebersprungen.join('; ') : '');
  window.gruenTest = t;
  console.log('[selftest]', t.zusammenfassung, t.fails, t.errors);
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:999;max-height:60%;overflow:auto;padding:12px;border-radius:12px;font:12px/1.4 monospace;white-space:pre-wrap;color:#fff;background:' + (t.fails.length || t.errors.length ? '#a23a2e' : '#2e5339');
  box.textContent = t.zusammenfassung + (t.fails.length ? '\n\nFEHLGESCHLAGEN:\n- ' + t.fails.join('\n- ') : '') + (t.errors.length ? '\n\nFEHLER:\n' + t.errors.join('\n\n') : '');
  box.onclick = () => box.remove();
  document.body.append(box);
})();
