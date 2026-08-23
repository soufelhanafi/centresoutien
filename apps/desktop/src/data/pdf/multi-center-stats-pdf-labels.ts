/** The FR/AR label set for the multi-center stats owner report (SOU-106). The
 *  document's copy lives here with the pdf-lib adapter, per the repo's PDF
 *  convention (the domain owns no user-facing strings). */
export type MultiCenterStatsPdfLabels = {
  readonly title: string;
  readonly month: string;
  readonly centersSummary: (available: number, total: number) => string;
  readonly totalRevenue: string;
  readonly totalCollected: string;
  readonly totalStudents: string;
  readonly totalUnpaidRate: string;
  readonly revenue: string;
  readonly collected: string;
  readonly students: string;
  readonly unpaidRate: string;
  readonly momGrowth: string;
  readonly unavailable: string;
  readonly notApplicable: string;
};

export function multiCenterStatsPdfLabels(locale: 'fr' | 'ar'): MultiCenterStatsPdfLabels {
  if (locale === 'ar') {
    return {
      title: 'إحصائيات المراكز',
      month: 'الشهر',
      centersSummary: (available, total) => `${available} من ${total} مراكز متاحة`,
      totalRevenue: 'إجمالي المداخيل',
      totalCollected: 'المبالغ المحصلة',
      totalStudents: 'إجمالي التلاميذ',
      totalUnpaidRate: 'نسبة غير المؤداة',
      revenue: 'المداخيل',
      collected: 'المحصل',
      students: 'التلاميذ',
      unpaidRate: 'نسبة غير المؤداة',
      momGrowth: 'النمو الشهري',
      unavailable: 'المركز غير متاح',
      notApplicable: '—',
    };
  }
  return {
    title: 'Statistiques par centre',
    month: 'Mois',
    centersSummary: (available, total) => `${available} centre(s) disponible(s) sur ${total}`,
    totalRevenue: 'Chiffre d’affaires total',
    totalCollected: 'Total encaissé',
    totalStudents: 'Total élèves',
    totalUnpaidRate: 'Taux d’impayés',
    revenue: 'Chiffre d’affaires',
    collected: 'Encaissé',
    students: 'Élèves',
    unpaidRate: 'Taux d’impayés',
    momGrowth: 'Croissance mensuelle',
    unavailable: 'Centre indisponible',
    notApplicable: '—',
  };
}
