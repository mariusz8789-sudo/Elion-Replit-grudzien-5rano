export const matrixRainVertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
export const matrixRainFragmentShader = `
uniform float uTime; uniform float uPrompt; uniform float uMode; varying vec2 vUv;
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv=vUv; float columns=92.0; float x=floor(uv.x*columns); float lane=fract(uv.x*columns);
  float speed=0.16+hash21(vec2(x,3.0)+uPrompt)*0.42; float head=fract(uv.y+uTime*speed+hash21(vec2(x,7.0)+uPrompt));
  float glyph=step(0.78,hash21(vec2(floor(lane*8.0),floor(head*46.0)+x)));
  float trail=smoothstep(0.22,0.0,head)*smoothstep(0.05,0.2,lane)*smoothstep(0.95,0.8,lane);
  float intensity=glyph*trail*0.18;
  vec3 color=mix(vec3(0.0,0.25,0.08),vec3(0.0,1.0,0.255),intensity*5.0);
  gl_FragColor=vec4(color,intensity);
}`;

export const particleVertexShader = `
uniform float uTime; uniform float uPrompt; uniform float uMode; attribute float aEnergy; attribute float aW; varying float vEnergy;
void main(){ vec3 p=position; float t=uTime*(0.16+aEnergy*0.08)+uPrompt*6.283;
  if(uMode>0.5 && uMode<1.5){ float gx=floor(aEnergy*18.0)-9.0; float gz=floor(aW*18.0)-9.0; float tower=fract(aEnergy*97.0); p=vec3(gx*.42, tower*3.0-1.5, gz*.42); p.y+=sin(t+gx*2.0+gz)*.08; }
  else if(uMode>1.5 && uMode<2.5){ float pulse=1.0+sin(t*1.8+aW*8.0)*.22; p*=pulse; p.y+=sin(t+p.x*2.0)*.2; }
  else { float x=p.x*cos(t)-aW*sin(t); float z=p.z*cos(t*.71)-aW*sin(t*.71); p.x=x+sin(t+p.z+uPrompt)*.16; p.y+=cos(t*.83+p.x+uPrompt)*.18; p.z=z; if(uMode>2.5){ p.xy=mat2(cos(t*.4),-sin(t*.4),sin(t*.4),cos(t*.4))*p.xy; } }
  vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=(0.7+aEnergy*1.5)*(70.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; vEnergy=aEnergy; }`;
export const particleFragmentShader = `varying float vEnergy; void main(){ vec2 uv=gl_PointCoord-.5; float d=length(uv); if(d>.5) discard; float glow=pow(1.0-d*2.0,2.3); vec3 e=vec3(0.,1.,.255), c=vec3(0.,.898,1.); gl_FragColor=vec4(mix(e,c,clamp(vEnergy,0.,1.)),glow*(.08+vEnergy*.22)); }`;
export const hyperGlowVertexShader = `varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const hyperGlowFragmentShader = `varying vec3 vNormal; void main(){float rim=pow(1.-max(0.,dot(vNormal,vec3(0.,0.,1.))),2.4);gl_FragColor=vec4(0.,.9,1.,rim*.22);}`;
