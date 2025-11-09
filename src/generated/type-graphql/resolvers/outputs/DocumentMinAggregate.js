"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentMinAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let DocumentMinAggregate = class DocumentMinAggregate {
};
exports.DocumentMinAggregate = DocumentMinAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentMinAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentMinAggregate.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentMinAggregate.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentMinAggregate.prototype, "updatedAt", void 0);
exports.DocumentMinAggregate = DocumentMinAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("DocumentMinAggregate", {})
], DocumentMinAggregate);
