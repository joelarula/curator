"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByChunkArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkOrderByWithAggregationInput_1 = require("../../../inputs/ChunkOrderByWithAggregationInput");
const ChunkScalarWhereWithAggregatesInput_1 = require("../../../inputs/ChunkScalarWhereWithAggregatesInput");
const ChunkWhereInput_1 = require("../../../inputs/ChunkWhereInput");
const ChunkScalarFieldEnum_1 = require("../../../../enums/ChunkScalarFieldEnum");
let GroupByChunkArgs = class GroupByChunkArgs {
};
exports.GroupByChunkArgs = GroupByChunkArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], GroupByChunkArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkOrderByWithAggregationInput_1.ChunkOrderByWithAggregationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByChunkArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarFieldEnum_1.ChunkScalarFieldEnum], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], GroupByChunkArgs.prototype, "by", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkScalarWhereWithAggregatesInput_1.ChunkScalarWhereWithAggregatesInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkScalarWhereWithAggregatesInput_1.ChunkScalarWhereWithAggregatesInput)
], GroupByChunkArgs.prototype, "having", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByChunkArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], GroupByChunkArgs.prototype, "skip", void 0);
exports.GroupByChunkArgs = GroupByChunkArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], GroupByChunkArgs);
