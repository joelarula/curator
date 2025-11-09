"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataRelationFilter_1 = require("../inputs/FileDataRelationFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const IntNullableFilter_1 = require("../inputs/IntNullableFilter");
const ModelRelationFilter_1 = require("../inputs/ModelRelationFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let ChunkWhereInput = class ChunkWhereInput {
};
exports.ChunkWhereInput = ChunkWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkWhereInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkWhereInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntNullableFilter_1.IntNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntNullableFilter_1.IntNullableFilter)
], ChunkWhereInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkWhereInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkWhereInput.prototype, "modelId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataRelationFilter_1.FileDataRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataRelationFilter_1.FileDataRelationFilter)
], ChunkWhereInput.prototype, "file", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelRelationFilter_1.ModelRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelRelationFilter_1.ModelRelationFilter)
], ChunkWhereInput.prototype, "model", void 0);
exports.ChunkWhereInput = ChunkWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkWhereInput", {})
], ChunkWhereInput);
