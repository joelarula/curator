"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateWithoutProjectInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const ChunkCreateNestedManyWithoutFileInput_1 = require("../inputs/ChunkCreateNestedManyWithoutFileInput");
let FileDataCreateWithoutProjectInput = class FileDataCreateWithoutProjectInput {
};
exports.FileDataCreateWithoutProjectInput = FileDataCreateWithoutProjectInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutProjectInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutProjectInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutProjectInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataCreateWithoutProjectInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataCreateWithoutProjectInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], FileDataCreateWithoutProjectInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateWithoutProjectInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataCreateWithoutProjectInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkCreateNestedManyWithoutFileInput_1.ChunkCreateNestedManyWithoutFileInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkCreateNestedManyWithoutFileInput_1.ChunkCreateNestedManyWithoutFileInput)
], FileDataCreateWithoutProjectInput.prototype, "Chunk", void 0);
exports.FileDataCreateWithoutProjectInput = FileDataCreateWithoutProjectInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateWithoutProjectInput", {})
], FileDataCreateWithoutProjectInput);
