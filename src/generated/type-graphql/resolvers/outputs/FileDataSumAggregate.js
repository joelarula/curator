"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataSumAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let FileDataSumAggregate = class FileDataSumAggregate {
};
exports.FileDataSumAggregate = FileDataSumAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataSumAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataSumAggregate.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataSumAggregate.prototype, "projectId", void 0);
exports.FileDataSumAggregate = FileDataSumAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("FileDataSumAggregate", {})
], FileDataSumAggregate);
