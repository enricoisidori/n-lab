let svgContent;
let paths = [];
let rows = []; // Array per tenere traccia delle righe
let scale;
let time = 0;
let amplitude = 0;
let frequency = 0.02;
let speed = 0.05;
let noiseScale = 0.005; // Scala per il rumore Perlin
let noiseSpeed = 0.5; // Velocità del rumore

function preload() {
  console.log("Loading SVG...");
  loadStrings("assets/lettere.svg", function (result) {
    console.log("SVG loaded");
    svgContent = result.join("\n");
    parseSVGContent();
    organizeRows();
  });
}

function parseSVGContent() {
  const pathRegex = /<path\s+d="([^"]+)"\s+fill="([^"]+)"/g;
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const pathData = match[1];
    const fillColor = match[2];
    const numbers = pathData.match(/[\d.]+/g).map(Number);
    const baseX = numbers[0];
    const baseY = numbers[1];

    paths.push({
      points: extractTrianglePoints(pathData),
      fill: fillColor,
      baseX: baseX,
      baseY: baseY,
    });
  }

  console.log("Total paths parsed:", paths.length);
}

function organizeRows() {
  // Raggruppa i rombi per riga basandosi sulla loro posizione Y
  let yGroups = {};

  paths.forEach((path) => {
    // Arrotonda la Y a un valore intero per raggruppare i rombi vicini
    let rowY = Math.round(path.baseY);

    if (!yGroups[rowY]) {
      yGroups[rowY] = [];
    }
    yGroups[rowY].push(path);
  });

  // Ordina le righe per Y e i rombi all'interno di ogni riga per X
  Object.keys(yGroups)
    .sort((a, b) => a - b)
    .forEach((y) => {
      let row = yGroups[y].sort((a, b) => a.baseX - b.baseX);
      rows.push(row);
    });

  console.log("Organized into", rows.length, "rows");
}

function extractTrianglePoints(pathData) {
  const numbers = pathData.match(/[\d.]+/g).map(Number);
  return [
    { x: numbers[0], y: numbers[1] },
    { x: numbers[2], y: numbers[3] },
    { x: numbers[4], y: numbers[5] },
    { x: numbers[6], y: numbers[7] },
  ];
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  scale = min(width / 1863, height / 36);
}

function draw() {
  background(0);

  if (paths.length === 0) {
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text("Loading SVG...", width / 2, height / 2);
    return;
  }

  // Aggiorna l'ampiezza in base alla posizione Y del mouse
  amplitude = map(mouseY, 0, height, 0, 30);

  // Center the drawing
  push();
  translate(width / 2 - (1863 * scale) / 2, height / 2 - (36 * scale) / 2);

  // Disegna ogni riga come un'unica entità
  noStroke();
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];

    // Calcola la deformazione per l'intera riga
    let rowNoise = noise(time * noiseSpeed, i * noiseScale);

    // Combina il rumore con una funzione sinusoidale per un effetto più organico
    let rowDeformation = map(rowNoise, 0, 1, -amplitude, amplitude);
    rowDeformation += sin(time + i * frequency) * amplitude * 0.5;

    // Disegna tutti i rombi nella riga con la stessa deformazione
    for (let path of row) {
      drawRhombus(path.points, path.fill, rowDeformation);
    }
  }
  pop();

  // Aggiorna il tempo per l'animazione
  time += speed;
}

function drawRhombus(points, fillColor, deformation) {
  fill(fillColor);

  // Calcola il centro del rombo
  let centerX = (points[0].x + points[2].x) / 2;
  let centerY = (points[0].y + points[2].y) / 2;

  // Applica la deformazione
  let transformedPoints = points.map((p) => {
    // Calcola la distanza dal centro
    let dx = p.x - centerX;
    let dy = p.y - centerY;

    // Applica una deformazione non lineare
    let distance = sqrt(dx * dx + dy * dy);
    let angle = atan2(dy, dx);

    // Aggiungi una leggera rotazione basata sulla deformazione
    angle += deformation * 0.1;

    // Applica la deformazione alla distanza
    let newDistance = distance * (1 + deformation * 0.2);

    // Calcola il nuovo punto
    return {
      x: centerX + cos(angle) * newDistance,
      y: centerY + sin(angle) * newDistance,
    };
  });

  // Disegna il rombo come due triangoli con i punti trasformati
  triangle(
    transformedPoints[0].x * scale,
    transformedPoints[0].y * scale,
    transformedPoints[1].x * scale,
    transformedPoints[1].y * scale,
    transformedPoints[2].x * scale,
    transformedPoints[2].y * scale
  );
  triangle(
    transformedPoints[0].x * scale,
    transformedPoints[0].y * scale,
    transformedPoints[2].x * scale,
    transformedPoints[2].y * scale,
    transformedPoints[3].x * scale,
    transformedPoints[3].y * scale
  );
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  scale = min(width / 1863, height / 36);
}
