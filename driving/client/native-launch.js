// Desktop sign-in, Assetto car selection and admission happen in the launcher.
export function nativeLaunchUrl(room){
 if(!['nohesi-110','nohesi-415'].includes(room))throw Error('Invalid server selection');
 return 'matrixgames://join?game=assetto-corsa&server=managed-'+room;
}