'use strict';

/**
 * Favicon da marca (logo "B" laranja da Bloise) embutido como SVG data URI,
 * sem necessidade de hospedar arquivo estático.
 */

// SVG recriado a partir do logo: "B" laranja com o quadradinho destacado à esquerda.
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<rect width="100" height="100" rx="18" fill="#ffffff"/>' +
  '<g fill="#f60">' +
  // haste superior + curva de cima do B
  '<path d="M22 20 h44 a20 20 0 0 1 0 40 H30 v-12 h36 a8 8 0 0 0 0-16 H34 v40 H22 Z"/>' +
  // curva inferior do B
  '<path d="M30 52 h36 a24 24 0 0 1 0 28 H22 V68 h44 a8 8 0 0 0 0-16 H30 Z"/>' +
  // quadradinho destacado à esquerda
  '<rect x="12" y="50" width="14" height="14" rx="3"/>' +
  '</g></svg>';

const FAVICON_DATA_URI =
  'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);

// Tag pronta para injeção no <head>.
const FAVICON_TAG = `<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">`;

module.exports = { FAVICON_TAG, FAVICON_DATA_URI, FAVICON_SVG };
