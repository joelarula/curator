"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataNameProjectIdCompoundUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let FileDataNameProjectIdCompoundUniqueInput = class FileDataNameProjectIdCompoundUniqueInput {
};
exports.FileDataNameProjectIdCompoundUniqueInput = FileDataNameProjectIdCompoundUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataNameProjectIdCompoundUniqueInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataNameProjectIdCompoundUniqueInput.prototype, "projectId", void 0);
exports.FileDataNameProjectIdCompoundUniqueInput = FileDataNameProjectIdCompoundUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataNameProjectIdCompoundUniqueInput", {})
], FileDataNameProjectIdCompoundUniqueInput);
