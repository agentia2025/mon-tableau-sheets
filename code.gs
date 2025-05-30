const SITES = {
  "Armitec CNPE": { lat: 47.232836, lon: 0.165783 },
  "Armitec Belliparc": { lat: 47.212460, lon: 0.168729 },
  "Bureau Maintenance": { lat: 47.232445, lon: 0.165100 }
};

const RAYON_METRES = 100;
// const VALID_USERS = ['EMP001', 'EMP002', 'EMP003', 'TEST']; // Commenté car nous utilisons checkIdentifiant
const SPREADSHEET_ID = '1n2GKLE9awLisdgAQU_O6_pl-WVwSeXWf5g5tWx7Ucks';
const SHEET_NAME = 'Pointages'; // Pour la fonction submitPointage

// Nouvelle fonction pour vérifier l'identifiant via la feuille "identifiant"
function checkIdentifiant(id) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("identifiant"); // Doit exister une feuille nommée "identifiant"

    if (!sheet) {
      console.error("Feuille 'identifiant' non trouvée dans le Spreadsheet ID: " + SPREADSHEET_ID);
      return false;
    }

    const range = sheet.getRange("A:A");
    const values = range.getValues();

    const idList = values.map(row => row[0] ? row[0].toString().trim().toLowerCase() : "").filter(String);
    const idToCheck = id ? id.toString().trim().toLowerCase() : "";

    if (idList.includes(idToCheck)) {
      return true;
    } else {
      console.log("Identifiant non trouvé dans la liste feuille 'identifiant': " + idToCheck);
      return false;
    }

  } catch (e) {
    console.error("Erreur lors de la vérification de l'identifiant via Spreadsheet: " + e.toString());
    return false;
  }
}

/**
 * Affiche le formulaire HTML
 */
function doGet(e) {
  const page = e.parameter.page || 'pointer';  // par défaut on affiche le form
  let template;
  let title;

  if (page === 'report') {
    template = HtmlService.createTemplateFromFile('MesPointages'); // Assurez-vous d'avoir ce fichier HTML
    title    = 'Mes pointages';
  } else {
    template = HtmlService.createTemplateFromFile('formulaire'); // C'est ici que notre script client ira
    title    = 'Pointeuse GPS - Armitec';
  }

  return template
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Enregistre un pointage (Début / Fin / Fin d'OF)
 */
function submitPointage(data) {
  console.log("--- Début submitPointage ---");
  console.log("Identifiant reçu (data.identifiant): " + data.identifiant);

  // La validation de l'identifiant est maintenant gérée en amont par checkIdentifiant,
  // appelée depuis le client avant que submitPointage ne soit invoquée.
  // La ligne suivante est donc commentée :
  // if (!VALID_USERS.includes(data.identifiant)) {
  //   return `❌ Identifiant non reconnu : ${data.identifiant}`;
  // }

  const isTest = (data.identifiant === 'TEST'); // Si vous gardez un utilisateur TEST spécial
  console.log("isTest: " + isTest);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Feuille '${SHEET_NAME}' introuvable`);

  const horodatage = new Date();
  const lat = parseFloat(data.latitude);
  const lon = parseFloat(data.longitude);
  console.log("Coordonnées reçues - Latitude: " + lat + ", Longitude: " + lon);

  let site = 'Hors zone';
  let dist = Infinity;
  let ok = false;
  console.log("Avant contrôle GPS - ok: " + ok);

  if (isTest) {
    site = 'Test User';
    dist = 0;
    ok = true;
    console.log("Utilisateur TEST identifié - ok: " + ok);
  } else {
    console.log("Utilisateur non-TEST. Début de la boucle sur SITES.");
    for (const [nom, c] of Object.entries(SITES)) {
      const d = distance(lat, lon, c.lat, c.lon);
      console.log("Site: " + nom + " - Coords Site: (Lat: " + c.lat + ", Lon: " + c.lon + ") - Distance calculée (d): " + d);
      if (d < dist) dist = d;
      if (d <= RAYON_METRES) {
        site = nom;
        ok = true;
        console.log("DANS LA ZONE pour le site: " + nom + " - ok: " + ok + " - d: " + d + " <= RAYON_METRES: " + RAYON_METRES);
        break;
      } else {
        console.log("HORS ZONE pour le site: " + nom + " - d: " + d + " > RAYON_METRES: " + RAYON_METRES);
      }
    }
    console.log("Fin de la boucle sur SITES - Valeur finale de ok: " + ok + ", Site: " + site + ", Dist la plus proche: " + dist);
  }

  console.log("Après contrôle GPS - Valeur de ok avant le 'if (!ok)': " + ok);
  // Note: La validation GPS se fait ici. Si checkIdentifiant a réussi mais que le GPS échoue ici,
  // le message d'erreur viendra de submitPointage.
  if (!ok) {
    console.log("Condition !ok est VRAIE. Pointage refusé.");
    return `❌ Hors zone (${Math.round(dist)} m) – Pointage refusé.`;
  }
  console.log("Condition !ok est FAUSSE. Pointage accepté. Site: " + site);

  const base = [
    horodatage,
    data.identifiant,
    data.type_pointage,
    data.type_intervention || '',  // <-- CETTE LIGNE SERA À MODIFIER
    data.of || '',
    data.option1 || '',
    data.option2 || '',
    data.option3 || '',
    data.option4 || '',
    data.option5 || '',
    data.dosimetrie || '',
    data.rtr || '',
    lat,
    lon,
    site,
    Math.round(dist),
    'Oui'
  ];

  let duree = '';

  if (data.type_pointage === 'Début') {
    sheet.appendRow([...base, '']);
    console.log("--- Fin submitPointage (Début) ---");
    return `✅ Pointage Début enregistré sur ${site}`;
  }

  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i > 0; i--) {
    const r = rows[i];
    if (
      r[1] === data.identifiant &&
      r[2] === 'Début' &&
      (!data.of || r[4] === data.of) // Assurez-vous que data.of existe avant de comparer
    ) {
      const diff = horodatage - new Date(r[0]);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      duree = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      sheet.getRange(i + 1, base.length + 1).setValue(duree); // +1 car base.length est l'index de la dernière colonne écrite
      break;
    }
  }

  sheet.appendRow([...base, duree]);
  console.log("--- Fin submitPointage (Fin/FinOF) ---");
  return `✅ Pointage ${data.type_pointage} enregistré sur ${site}`;
}

/**
 * Calcule la distance en mètres entre deux coordonnées GPS
 */
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Récupère les pointages consolidés par date pour un identifiant
 */
function getPointagesById(identifiant) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  const lignes = data.slice(1)
    .filter(row => row[1] === identifiant && row[0]);

  const parDate = {};

  for (const row of lignes) {
    const dateKey = Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "yyyy-MM-dd");

    let totalSecs = 0;
    // Colonne 15 (index 14) pour la durée
    if (row[16] instanceof Date) { // NOTE: L'index de la durée a changé à cause de 'Oui'
      totalSecs = row[16].getHours() * 3600 + row[16].getMinutes() * 60 + row[16].getSeconds();
    } else if (typeof row[16] === 'string' && row[16].includes(':')) {
      const parts = row[16].split(':').map(Number);
      if (parts.length === 3) {
        totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }

    if (!parDate[dateKey]) {
      parDate[dateKey] = {
        totalSeconds: 0,
        option1: '',
        option2: '',
        option3: '',
        option4: '',
        option5: '',
        dosimetrie: '',
        rtr: ''
      };
    }

    parDate[dateKey].totalSeconds += totalSecs;
    if (row[5]) parDate[dateKey].option1 = row[5];
    if (row[6]) parDate[dateKey].option2 = row[6];
    if (row[7]) parDate[dateKey].option3 = row[7]; // Corrigé index pour option3
    if (row[8]) parDate[dateKey].option4 = row[8]; // Corrigé index pour option4
    if (row[9]) parDate[dateKey].option5 = row[9]; // Corrigé index pour option5
    if (row[10]) parDate[dateKey].dosimetrie = row[10];
    if (row[11]) parDate[dateKey].rtr = row[11];
  }

  const resultat = [];

  for (const date in parDate) {
    const t = parDate[date];
    const h = Math.floor(t.totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((t.totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(t.totalSeconds % 60).toString().padStart(2, '0');
    const dureeTotale = `${h}:${m}:${s}`;
    resultat.push({
      date: date,
      duree: dureeTotale,
      option1: t.option1,
      option2: t.option2,
      option3: t.option3,
      option4: t.option4,
      option5: t.option5,
      dosimetrie: t.dosimetrie,
      rtr: t.rtr
    });
  }

  resultat.sort((a, b) => new Date(b.date) - new Date(a.date));
  return resultat;
}

/**
 * Interface compatible avec la page HTML MesPointages.html
 */
function getPointagesParIdentifiant(identifiant) {
  return getPointagesById(identifiant);
}
