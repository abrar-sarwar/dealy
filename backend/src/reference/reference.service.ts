import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async listSchools() {
    const schools = await this.prisma.school.findMany({
      orderBy: { name: 'asc' },
      include: { campuses: { orderBy: { name: 'asc' } } },
    });
    return schools.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      shortName: s.shortName,
      campuses: s.campuses.map(this.mapCampus),
    }));
  }

  async listCampuses() {
    const campuses = await this.prisma.campus.findMany({ orderBy: { name: 'asc' } });
    return campuses.map(this.mapCampus);
  }

  async listCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
    return categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      displayName: c.displayName,
      symbol: c.symbol,
    }));
  }

  private mapCampus(c: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    cityContext: string;
    latitude: number;
    longitude: number;
    defaultRadius: number;
  }) {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      shortName: c.shortName,
      cityContext: c.cityContext,
      latitude: c.latitude,
      longitude: c.longitude,
      defaultRadius: c.defaultRadius,
    };
  }
}
