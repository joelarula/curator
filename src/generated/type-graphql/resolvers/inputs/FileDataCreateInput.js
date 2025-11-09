"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const ChunkCreateNestedManyWithoutFileInput_1 = require("../inputs/ChunkCreateNestedManyWithoutFileInput");
const ProjectCreateNestedOneWithoutFilesInput_1 = require("../inputs/ProjectCreateNestedOneWithoutFilesInput");
let FileDataCreateInput = class FileDataCreateInput {
};
exports.FileDataCreateInput = FileDataCreateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataCreateInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], FileDataCreateInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateNestedOneWithoutFilesInput_1.ProjectCreateNestedOneWithoutFilesInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ProjectCreateNestedOneWithoutFilesInput_1.ProjectCreateNestedOneWithoutFilesInput)
], FileDataCreateInput.prototype, "project", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkCreateNestedManyWithoutFileInput_1.ChunkCreateNestedManyWithoutFileInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkCreateNestedManyWithoutFileInput_1.ChunkCreateNestedManyWithoutFileInput)
], FileDataCreateInput.prototype, "Chunk", void 0);
exports.FileDataCreateInput = FileDataCreateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateInput", {})
], FileDataCreateInput);
