import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ListingDraftPreview,
  MetadataAuditResult,
} from '@asobeast/shared';
import { ListingQueryDto } from '../apps/dto/listing-query.dto';
import { RateLimitClass } from '../auth/rate-limit/rate-class';
import { ReadOnlyEndpoint } from '../auth/read-access';
import { ListingDraftDto } from './dto/listing-draft.dto';
import { ListingDraftPreviewService } from './listing-draft-preview.service';
import { MetadataService } from './metadata.service';

@ApiTags('metadata')
@Controller('apps/:id/metadata')
export class MetadataController {
  constructor(
    private readonly metadata: MetadataService,
    private readonly drafts: ListingDraftPreviewService,
  ) {}

  @Get('audit')
  @ApiOperation({ summary: 'Metadata lint and keyword coverage matrix' })
  audit(
    @Param('id') id: string,
    @Query() query: ListingQueryDto,
  ): Promise<MetadataAuditResult> {
    return this.metadata.audit(id, query.country, query.localization ?? null);
  }

  @Post('preview')
  @HttpCode(200)
  @ReadOnlyEndpoint()
  @RateLimitClass('read')
  @ApiOperation({
    summary: 'Preview a listing draft without writing',
    description:
      'Judges a draft of the title, subtitle, keyword field, short description or description against the stored listing of one storefront and localization. Omitted fields keep their stored value. Answers the lint of every field, each tracked keyword of the market with its coverage before and after the draft, its latest position and whether losing it puts a top 10 position at risk, and, for the home storefront default listing, the audit score before and after. Writes nothing and queues nothing.',
  })
  preview(
    @Param('id') id: string,
    @Body() dto: ListingDraftDto,
  ): Promise<ListingDraftPreview> {
    return this.drafts.preview(id, dto);
  }
}
