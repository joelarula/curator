"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataListRelationFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereInput_1 = require("../inputs/FileDataWhereInput");
let FileDataListRelationFilter = class FileDataListRelationFilter {
};
exports.FileDataListRelationFilter = FileDataListRelationFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataListRelationFilter.prototype, "every", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataListRelationFilter.prototype, "some", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataListRelationFilter.prototype, "none", void 0);
exports.FileDataListRelationFilter = FileDataListRelationFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataListRelationFilter", {})
], FileDataListRelationFilter);
