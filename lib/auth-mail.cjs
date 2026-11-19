'use strict';
function recoveryAvailable(){return Boolean(process.env.RESEND_API_KEY&&process.env.CASHFLOW_FROM_EMAIL&&process.env.CASHFLOW_PUBLIC_URL)}
async function sendRecovery(email,token){
  if(!recoveryAvailable())throw new Error('El correo de recuperación no está configurado.');
  const base=new URL(process.env.CASHFLOW_PUBLIC_URL);
  if(base.protocol!=='https:')throw new Error('La URL pública de recuperación debe usar HTTPS.');
  const link=new URL('/',base);link.searchParams.set('reset',token);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({from:process.env.CASHFLOW_FROM_EMAIL,to:[email],subject:'Restablecer contraseña de Cashflow',text:`Solicitaste restablecer tu contraseña de Cashflow. Abrí este enlace dentro de los próximos 30 minutos:\n\n${link.toString()}\n\nSi no hiciste esta solicitud, ignorá este correo.`})});
  if(!response.ok)throw new Error('No se pudo enviar el correo de recuperación.');
}
module.exports={recoveryAvailable,sendRecovery};
