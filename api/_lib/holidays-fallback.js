// Respaldo aproximado por si el servicio de feriados no responde. Siempre se pueden editar en el plan.
export const FALLBACK = {
  AR: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-02-16', 'Carnaval'], ['2026-02-17', 'Carnaval'], ['2026-03-23', 'Feriado puente turístico'], ['2026-03-24', 'Día de la Memoria'], ['2026-04-02', 'Día del Veterano y de los Caídos en Malvinas'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajador'], ['2026-05-25', 'Día de la Revolución de Mayo'], ['2026-06-15', 'Paso a la Inmortalidad del Gral. Güemes'], ['2026-06-20', 'Día de la Bandera'], ['2026-07-09', 'Día de la Independencia'], ['2026-07-10', 'Feriado puente turístico'], ['2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín'], ['2026-10-12', 'Día del Respeto a la Diversidad Cultural'], ['2026-11-23', 'Día de la Soberanía Nacional'], ['2026-12-07', 'Feriado puente turístico'], ['2026-12-08', 'Inmaculada Concepción de María'], ['2026-12-25', 'Navidad']],
    2027: [['2027-01-01', 'Año Nuevo'], ['2027-02-08', 'Carnaval'], ['2027-02-09', 'Carnaval'], ['2027-03-24', 'Día de la Memoria'], ['2027-03-26', 'Viernes Santo'], ['2027-04-02', 'Día del Veterano y de los Caídos en Malvinas'], ['2027-05-01', 'Día del Trabajador'], ['2027-05-25', 'Día de la Revolución de Mayo'], ['2027-06-20', 'Día de la Bandera'], ['2027-07-09', 'Día de la Independencia'], ['2027-12-08', 'Inmaculada Concepción de María'], ['2027-12-25', 'Navidad']],
  },
  MX: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-02-02', 'Día de la Constitución'], ['2026-03-16', 'Natalicio de Benito Juárez'], ['2026-05-01', 'Día del Trabajo'], ['2026-09-16', 'Día de la Independencia'], ['2026-11-16', 'Día de la Revolución'], ['2026-12-25', 'Navidad']],
    2027: [['2027-01-01', 'Año Nuevo'], ['2027-02-01', 'Día de la Constitución'], ['2027-03-15', 'Natalicio de Benito Juárez'], ['2027-05-01', 'Día del Trabajo'], ['2027-09-16', 'Día de la Independencia'], ['2027-11-15', 'Día de la Revolución'], ['2027-12-25', 'Navidad']],
  },
  CL: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-04-03', 'Viernes Santo'], ['2026-04-04', 'Sábado Santo'], ['2026-05-01', 'Día del Trabajo'], ['2026-05-21', 'Día de las Glorias Navales'], ['2026-06-21', 'Día de los Pueblos Indígenas'], ['2026-06-29', 'San Pedro y San Pablo'], ['2026-07-16', 'Virgen del Carmen'], ['2026-08-15', 'Asunción de la Virgen'], ['2026-09-18', 'Independencia Nacional'], ['2026-09-19', 'Glorias del Ejército'], ['2026-10-12', 'Encuentro de Dos Mundos'], ['2026-10-31', 'Día de las Iglesias Evangélicas'], ['2026-11-01', 'Todos los Santos'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad']],
  },
  CO: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-01-12', 'Reyes Magos'], ['2026-03-23', 'San José'], ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajo'], ['2026-05-18', 'Ascensión del Señor'], ['2026-06-08', 'Corpus Christi'], ['2026-06-15', 'Sagrado Corazón'], ['2026-06-29', 'San Pedro y San Pablo'], ['2026-07-20', 'Independencia'], ['2026-08-07', 'Batalla de Boyacá'], ['2026-08-17', 'Asunción de la Virgen'], ['2026-10-12', 'Día de la Raza'], ['2026-11-02', 'Todos los Santos'], ['2026-11-16', 'Independencia de Cartagena'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad']],
  },
  PE: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajo'], ['2026-06-07', 'Batalla de Arica'], ['2026-06-29', 'San Pedro y San Pablo'], ['2026-07-23', 'Día de la Fuerza Aérea'], ['2026-07-28', 'Fiestas Patrias'], ['2026-07-29', 'Fiestas Patrias'], ['2026-08-06', 'Batalla de Junín'], ['2026-08-30', 'Santa Rosa de Lima'], ['2026-10-08', 'Combate de Angamos'], ['2026-11-01', 'Todos los Santos'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-09', 'Batalla de Ayacucho'], ['2026-12-25', 'Navidad']],
  },
  UY: {
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-01-06', 'Día de Reyes'], ['2026-02-16', 'Carnaval'], ['2026-02-17', 'Carnaval'], ['2026-04-02', 'Semana de Turismo'], ['2026-04-03', 'Semana de Turismo'], ['2026-05-01', 'Día de los Trabajadores'], ['2026-05-18', 'Batalla de Las Piedras'], ['2026-06-19', 'Natalicio de Artigas'], ['2026-07-18', 'Jura de la Constitución'], ['2026-08-25', 'Declaratoria de la Independencia'], ['2026-10-12', 'Día de la Diversidad Cultural'], ['2026-11-02', 'Día de los Difuntos'], ['2026-12-25', 'Navidad']],
  },
};
