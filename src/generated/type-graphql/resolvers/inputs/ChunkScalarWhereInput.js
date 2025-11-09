"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkScalarWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const IntFilter_1 = require("../inputs/IntFilter");
const IntNullableFilter_1 = require("../inputs/IntNullableFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let ChunkScalarWhereInput = class ChunkScalarWhereInput {
};
exports.ChunkScalarWhereInput = ChunkScalarWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkScalarWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkScalarWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkScalarWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkScalarWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkScalarWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkScalarWhereInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkScalarWhereInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntNullableFilter_1.IntNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntNullableFilter_1.IntNullableFilter)
], ChunkScalarWhereInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkScalarWhereInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkScalarWhereInput.prototype, "modelId", void 0);
exports.ChunkScalarWhereInput = ChunkScalarWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkScalarWhereInput", {})
], ChunkScalarWhereInput);
