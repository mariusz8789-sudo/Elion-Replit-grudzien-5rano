export const matrixRainVertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const matrixRainFragmentShader = `
uniform float uTime; uniform float uPrompt; uniform float uMode; varying vec2 vUv;
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv=vUv; float columns=48.0; float x=floor(uv.x*columns); float lane=fract(uv.x*columns+hash21(vec2(x,11.0)+uPrompt)*0.55);
  float speed=0.10+hash21(vec2(x,3.0)+uPrompt)*0.26; float head=fract(uv.y+uTime*speed+hash21(vec2(x,7.0)+uPrompt));
  float cell=fract(head*26.0+hash21(vec2(x,floor(head*26.0))+uPrompt)*0.3)-0.5;
  float shapeSeed=hash21(vec2(x, floor(head*26.0)) + uPrompt);
  float width=0.18+shapeSeed*0.10;
  float radius=length(vec2((lane-0.5)/width, cell*2.8));
  float droplet=1.0-smoothstep(0.18,1.0,radius);
  float tail=smoothstep(0.42,0.0,head)*smoothstep(0.0,0.16,lane)*smoothstep(1.0,0.84,lane);
  float core=pow(droplet,2.2)*0.72;
  float intensity=(core+droplet*tail*0.22)*smoothstep(0.0,0.08,head);
  vec3 color=mix(vec3(0.0,0.18,0.05),vec3(0.0,1.0,0.255),clamp(intensity*2.4,0.0,1.0));
  gl_FragColor=vec4(color,clamp(intensity,0.0,0.72));
}`;

export const particleVertexShader = `
uniform float uTime; uniform float uPrompt; uniform float uMode; attribute float aEnergy; attribute float aW; varying float vEnergy;
void main(){ vec3 p=position; float t=uTime*(0.16+aEnergy*0.08)+uPrompt*6.283;
  if(uMode>0.5 && uMode<1.5){ float gx=floor(aEnergy*18.0)-9.0; float gz=floor(aW*18.0)-9.0; float tower=fract(aEnergy*97.0); p=vec3(gx*.42, tower*3.0-1.5, gz*.42); p.y+=sin(t+gx*2.0+gz)*.08; }
  else if(uMode>1.5 && uMode<2.5){ float pulse=1.0+sin(t*1.8+aW*8.0)*.22; p*=pulse; p.y+=sin(t+p.x*2.0)*.2; }
  else { float x=p.x*cos(t)-aW*sin(t); float z=p.z*cos(t*.71)-aW*sin(t*.71); p.x=x+sin(t+p.z+uPrompt)*.16; p.y+=cos(t*.83+p.x+uPrompt)*.18; p.z=z; if(uMode>2.5){ p.xy=mat2(cos(t*.4),-sin(t*.4),sin(t*.4),cos(t*.4))*p.xy; } }
  vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=(0.18+aEnergy*0.42)*(34.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; vEnergy=aEnergy; }`;
export const particleFragmentShader = `varying float vEnergy; void main(){ vec2 uv=gl_PointCoord-.5; float d=length(uv); if(d>.5) discard; float glow=pow(1.0-d*2.0,2.8); vec3 e=vec3(0.,1.,.255), c=vec3(0.,.898,1.); gl_FragColor=vec4(mix(e,c,clamp(vEnergy,0.,1.)),glow*(.045+vEnergy*.12)); }`;
export const hyperGlowVertexShader = `varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const hyperGlowFragmentShader = `varying vec3 vNormal; void main(){float rim=pow(1.-max(0.,dot(vNormal,vec3(0.,0.,1.))),2.4);gl_FragColor=vec4(0.,.9,1.,rim*.22);}`;
