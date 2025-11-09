"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereInput_1 = require("../inputs/ChunkWhereInput");
const FileDataRelationFilter_1 = require("../inputs/FileDataRelationFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const IntNullableFilter_1 = require("../inputs/IntNullableFilter");
const ModelRelationFilter_1 = require("../inputs/ModelRelationFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let ChunkWhereUniqueInput = class ChunkWhereUniqueInput {
};
exports.ChunkWhereUniqueInput = ChunkWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ChunkWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput_1.ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput_1.ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereInput_1.ChunkWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkWhereUniqueInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ChunkWhereUniqueInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntNullableFilter_1.IntNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntNullableFilter_1.IntNullableFilter)
], ChunkWhereUniqueInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkWhereUniqueInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ChunkWhereUniqueInput.prototype, "modelId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataRelationFilter_1.FileDataRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataRelationFilter_1.FileDataRelationFilter)
], ChunkWhereUniqueInput.prototype, "file", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelRelationFilter_1.ModelRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelRelationFilter_1.ModelRelationFilter)
], ChunkWhereUniqueInput.prototype, "model", void 0);
exports.ChunkWhereUniqueInput = ChunkWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkWhereUniqueInput", {})
], ChunkWhereUniqueInput);
