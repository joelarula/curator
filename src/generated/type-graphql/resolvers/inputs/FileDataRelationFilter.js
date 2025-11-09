"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataRelationFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereInput_1 = require("../inputs/FileDataWhereInput");
let FileDataRelationFilter = class FileDataRelationFilter {
};
exports.FileDataRelationFilter = FileDataRelationFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataRelationFilter.prototype, "is", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataRelationFilter.prototype, "isNot", void 0);
exports.FileDataRelationFilter = FileDataRelationFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataRelationFilter", {})
], FileDataRelationFilter);
