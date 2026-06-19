import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapPrismaDeal } from './deal.mapper';
import type { DealDto } from './deal.dto';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string): Promise<DealDto> {
    const deal = await this.prisma.deal.findFirst({
      where: { id, status: 'published' },
      include: { category: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return mapPrismaDeal(deal, null);
  }
}
