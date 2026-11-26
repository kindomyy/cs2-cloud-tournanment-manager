// All guide and wing geometry is mirrored about x=200; only the light is textured.
function Wing() {
  return <>
    <g className="wing-guides">
      <circle cx="373" cy="166" r="153" className="draw-circle-sub" />
      <circle cx="286" cy="207" r="68" className="draw-circle-main" />
      <path d="M218 205L486 40M218 205L514 110M218 205L526 184M218 205L494 274" className="draw-axis" />
      <circle cx="486" cy="40" r="2" className="grid-node" />
      <circle cx="514" cy="110" r="2" className="grid-node" />
      <circle cx="526" cy="184" r="2" className="grid-node" />
    </g>
    <g className="wing-light" filter="url(#startup-reference-cyber-ink-texture)">
      <path d="M218 198C268 155 325 80 486 40C426 87 314 184 224 208Z" />
      <path d="M225 207C300 171 399 100 514 110C456 127 341 214 229 215Z" />
      <path d="M230 217C316 208 425 164 526 184C457 198 342 237 227 224Z" />
      <path d="M226 229C309 246 407 238 494 274C414 264 318 259 218 236Z" />
    </g>
    <g className="wing-ridges">
      <path d="M222 204C307 157 393 86 486 40M229 212C331 188 423 127 514 110M230 221C343 226 446 190 526 184M223 232C330 255 423 255 494 274" />
    </g>
  </>;
}
function Orbit({ radius, centerY, secondary = false }: { radius: number; centerY: number; secondary?: boolean }) {
  const d = `M200 ${centerY - radius} A${radius} ${radius} 0 0 1 200 ${centerY + radius}`;
  return <g className={secondary ? "orbit-secondary" : "orbit-primary"}>
    <path d={d} className={secondary ? "draw-circle-sub" : "draw-circle-main"} />
    <path d={d} transform="translate(400 0) scale(-1 1)" className={secondary ? "draw-circle-sub" : "draw-circle-main"} />
  </g>;
}
export function StartupShape() {
  return <svg className="startup-reference-shape" viewBox="-140 0 680 540" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <filter id="startup-reference-cyber-ink-texture" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045 0.08" numOctaves="3" seed="14" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="startup-reference-core-bloom" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <g id="startup-reference-construction-grid">
      <line x1="200" y1="12" x2="200" y2="528" className="draw-axis" />
      <line x1="26" y1="205" x2="374" y2="205" className="draw-axis" />
      <line x1="54" y1="275" x2="346" y2="275" className="draw-axis" />
      {[1, -1].map(side => <g key={side} data-guide-side={side} transform={side === -1 ? "translate(400 0) scale(-1 1)" : undefined}>
        <line x1="200" y1="205" x2="305" y2="100" className="draw-circle-sub" />
        <line x1="200" y1="205" x2="305" y2="310" className="draw-circle-sub" />
        <circle cx="254" cy="151" r="46" className="draw-circle-main" />
        <circle cx="254" cy="259" r="46" className="draw-circle-main" />
        <circle cx="242" cy="233" r="35" className="draw-circle-sub" />
        <circle cx="242" cy="317" r="35" className="draw-circle-sub" />
        <circle cx="254" cy="205" r="2.3" className="grid-node" />
        <line x1="328" y1="240" x2="340" y2="240" className="draw-axis" />
      </g>)}
      <Orbit radius={128} centerY={240} />
      <Orbit radius={92} centerY={240} secondary />
      <Orbit radius={154} centerY={240} secondary />
      <Orbit radius={64} centerY={275} secondary />
      {[151, 240, 259, 317, 435].map(y => <circle key={y} cx="200" cy={y} r="2" className="grid-node" />)}
    </g>
    <g className="wing-pair">
      <g data-wing-side="right"><Wing /></g>
      <g data-wing-side="left" transform="translate(400 0) scale(-1 1)"><Wing /></g>
    </g>
<g className="star-manifest-upper">
          <path
            className="star-body"
            filter="url(#startup-reference-cyber-ink-texture)"
            d="
              M 200 28
              C 202.5 142, 209 194, 214 198
              C 220 201, 275 203.5, 362 205
              C 275 206.5, 220 209, 214 212
              C 208 216, 202.5 290, 200 478
              C 197.5 290, 192 216, 186 212
              C 180 209, 125 206.5, 38 205
              C 125 203.5, 180 201, 186 198
              C 191 194, 197.5 142, 200 28
              Z
            "
          />
          <path
            className="star-body"
            opacity="0.85"
            d="
              M 200 36
              Q 203 196, 210 200
              Q 216 203.5, 352 205
              Q 216 206.5, 210 210
              Q 203 214, 200 468
              Q 197 214, 190 210
              Q 184 206.5, 48 205
              Q 184 203.5, 190 200
              Q 197 196, 200 36
              Z
            "
          />
          <path
            className="star-core-glow"
            filter="url(#startup-reference-core-bloom)"
            d="
              M 200 176
              Q 201.2 202.5, 203.5 203.8
              Q 205.5 204.6, 232 205
              Q 205.5 205.4, 203.5 206.2
              Q 201.2 207.5, 200 246
              Q 198.8 207.5, 196.5 206.2
              Q 194.5 205.4, 168 205
              Q 194.5 204.6, 196.5 203.8
              Q 198.8 202.5, 200 176
              Z
            "
          />
        </g>
        <g className="star-manifest-lower">
          <path
            className="star-body"
            filter="url(#startup-reference-cyber-ink-texture)"
            d="
              M 200 128
              C 202 222, 207 266, 211 269.5
              C 216 272, 260 273.8, 332 275
              C 260 276.2, 216 278, 211 280.5
              C 206.5 284, 202 355, 200 512
              C 198 355, 193.5 284, 189 280.5
              C 184 278, 140 276.2, 68 275
              C 140 273.8, 184 272, 189 269.5
              C 193 266, 198 222, 200 128
              Z
            "
          />
          <path
            className="star-core-glow"
            filter="url(#startup-reference-core-bloom)"
            d="
              M 200 252
              Q 201 273, 202.8 274
              Q 204.5 274.7, 224 275
              Q 204.5 275.3, 202.8 276
              Q 201 277, 200 308
              Q 199 277, 197.2 276
              Q 195.5 275.3, 176 275
              Q 195.5 274.7, 197.2 274
              Q 199 273, 200 252
              Z
            "
          />
        </g>
  </svg>;
}
