"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const BytesNullableFilter_1 = require("../inputs/BytesNullableFilter");
const ChunkListRelationFilter_1 = require("../inputs/ChunkListRelationFilter");
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const ProjectRelationFilter_1 = require("../inputs/ProjectRelationFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const StringNullableFilter_1 = require("../inputs/StringNullableFilter");
let FileDataWhereInput = class FileDataWhereInput {
};
exports.FileDataWhereInput = FileDataWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FileDataWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringNullableFilter_1.StringNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringNullableFilter_1.StringNullableFilter)
], FileDataWhereInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], FileDataWhereInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataWhereInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => BytesNullableFilter_1.BytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", BytesNullableFilter_1.BytesNullableFilter)
], FileDataWhereInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], FileDataWhereInput.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataWhereInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], FileDataWhereInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectRelationFilter_1.ProjectRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectRelationFilter_1.ProjectRelationFilter)
], FileDataWhereInput.prototype, "project", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkListRelationFilter_1.ChunkListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkListRelationFilter_1.ChunkListRelationFilter)
], FileDataWhereInput.prototype, "Chunk", void 0);
exports.FileDataWhereInput = FileDataWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataWhereInput", {})
], FileDataWhereInput);
