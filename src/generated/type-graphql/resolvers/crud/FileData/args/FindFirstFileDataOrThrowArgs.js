"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindFirstFileDataOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataOrderByWithRelationInput_1 = require("../../../inputs/FileDataOrderByWithRelationInput");
const FileDataWhereInput_1 = require("../../../inputs/FileDataWhereInput");
const FileDataWhereUniqueInput_1 = require("../../../inputs/FileDataWhereUniqueInput");
const FileDataScalarFieldEnum_1 = require("../../../../enums/FileDataScalarFieldEnum");
let FindFirstFileDataOrThrowArgs = class FindFirstFileDataOrThrowArgs {
};
exports.FindFirstFileDataOrThrowArgs = FindFirstFileDataOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FindFirstFileDataOrThrowArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataOrderByWithRelationInput_1.FileDataOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstFileDataOrThrowArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FindFirstFileDataOrThrowArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstFileDataOrThrowArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindFirstFileDataOrThrowArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [FileDataScalarFieldEnum_1.FileDataScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindFirstFileDataOrThrowArgs.prototype, "distinct", void 0);
exports.FindFirstFileDataOrThrowArgs = FindFirstFileDataOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindFirstFileDataOrThrowArgs);
