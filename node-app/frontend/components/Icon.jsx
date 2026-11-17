import React from 'react';
import { fontAwesomeDefinition } from '/shared/fontawesome-icons.js';

export function Icon({ name, size = 20 }) {
  const definition = fontAwesomeDefinition(name);
  const pixels = Number.isFinite(Number(size)) ? Math.max(8, Math.min(200, Number(size))) : 20;
  return <svg xmlns="http://www.w3.org/2000/svg" className={'fa-icon' + (definition.name === 'spinner' ? ' fa-spin' : '')} width={pixels} height={pixels} viewBox={`0 0 ${definition.width} ${definition.height}`} fill="currentColor" data-prefix="fas" data-icon={definition.name} aria-hidden="true" focusable="false">{definition.paths.map((path, index) => <path key={index} d={path} />)}</svg>;
}
